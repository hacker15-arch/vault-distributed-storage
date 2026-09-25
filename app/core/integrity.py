import hashlib
import logging
from typing import List, Optional

from app.core.metadata import MetadataManager, metadata_manager
from app.models.schemas import (
    ClusterScrubReport,
    ObjectIntegrityReport,
    ReplicaIntegrityDetail,
)
from app.storage.node import NodeOfflineError
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.integrity")


class IntegrityManager:
    """Manages SHA-256 data integrity verification, corruption detection, and cluster scrubbing."""

    def __init__(
        self,
        st_manager: Optional[StorageManager] = None,
        meta_mgr: Optional[MetadataManager] = None,
    ):
        self.storage_manager = st_manager or storage_manager
        self.metadata_manager = meta_mgr or metadata_manager

    @staticmethod
    def calculate_checksum(data: bytes) -> str:
        """Calculate SHA-256 checksum hex digest for raw bytes."""
        return hashlib.sha256(data).hexdigest()

    def verify_replica(
        self,
        object_name: str,
        node_name: str,
        expected_checksum: str,
        version: int,
    ) -> ReplicaIntegrityDetail:
        """Verify the physical SHA-256 integrity of a single replica on a given node."""
        try:
            node = self.storage_manager.get_node(node_name)
        except KeyError:
            return ReplicaIntegrityDetail(
                node_name=node_name,
                status="missing",
                expected_checksum=expected_checksum,
                error_message="Node does not exist in cluster",
            )

        if not node.is_online:
            return ReplicaIntegrityDetail(
                node_name=node_name,
                status="offline",
                expected_checksum=expected_checksum,
                error_message="Node is currently offline",
            )

        # 1. Check if replica file physically exists on disk at all
        try:
            if not node.object_exists(object_name):
                self.metadata_manager.update_replica_status(
                    object_name, version, node_name, "missing"
                )
                logger.warning(
                    "Replica missing on node %s for object '%s' (v%d)",
                    node_name,
                    object_name,
                    version,
                )
                return ReplicaIntegrityDetail(
                    node_name=node_name,
                    status="missing",
                    expected_checksum=expected_checksum,
                    local_version=node.get_local_version(object_name),
                    error_message="Replica file not found on disk",
                )
        except Exception as e:
            return ReplicaIntegrityDetail(
                node_name=node_name,
                status="error",
                expected_checksum=expected_checksum,
                error_message=str(e),
            )

        # 2. Check for stale version (local version != expected version)
        local_version = node.get_local_version(object_name)
        if local_version is not None and local_version < version:
            self.metadata_manager.update_replica_status(
                object_name, version, node_name, "stale"
            )
            logger.warning(
                "Stale replica on %s: holds v%d, cluster expects v%d for '%s'",
                node_name,
                local_version,
                version,
                object_name,
            )
            return ReplicaIntegrityDetail(
                node_name=node_name,
                status="stale",
                expected_checksum=expected_checksum,
                local_version=local_version,
                error_message=f"Node holds older version {local_version} (expected {version})",
            )

        # 3. Read physical bytes and compute SHA-256
        try:
            raw_data = node.read_object_bytes(object_name, version=version)
            actual_checksum = self.calculate_checksum(raw_data)

            if actual_checksum != expected_checksum:
                # CORRUPTION DETECTED
                self.metadata_manager.update_replica_status(
                    object_name, version, node_name, "corrupted"
                )
                logger.warning(
                    "Corruption detected: %s (v%d) on %s (expected %s, got %s)",
                    object_name,
                    version,
                    node_name,
                    expected_checksum,
                    actual_checksum,
                )
                return ReplicaIntegrityDetail(
                    node_name=node_name,
                    status="corrupted",
                    expected_checksum=expected_checksum,
                    actual_checksum=actual_checksum,
                    local_version=local_version,
                    error_message="SHA-256 checksum mismatch (corrupted data)",
                )

            # Healthy replica
            self.metadata_manager.update_replica_status(
                object_name, version, node_name, "healthy"
            )
            return ReplicaIntegrityDetail(
                node_name=node_name,
                status="healthy",
                expected_checksum=expected_checksum,
                actual_checksum=actual_checksum,
                local_version=local_version,
            )
        except Exception as e:
            return ReplicaIntegrityDetail(
                node_name=node_name,
                status="error",
                expected_checksum=expected_checksum,
                error_message=str(e),
            )

    def verify_object_integrity(
        self, object_name: str, version: Optional[int] = None
    ) -> ObjectIntegrityReport:
        """Verify the integrity of all replicas of an object."""
        if version is not None:
            ver_meta = self.metadata_manager.get_object_version(object_name, version)
            if not ver_meta:
                raise FileNotFoundError(f"Object '{object_name}' v{version} not found in catalog")
            target_version = version
            expected_checksum = ver_meta["checksum"]
            replicas = ver_meta["replicas"]
            target_rf = ver_meta.get("replication_factor", len(replicas))
        else:
            obj_meta = self.metadata_manager.get_object(object_name)
            if not obj_meta:
                raise FileNotFoundError(f"Object '{object_name}' not found in catalog")
            target_version = obj_meta["current_version"]
            expected_checksum = obj_meta["checksum"]
            # Include current replicas and any historical replica nodes
            history = self.metadata_manager.get_object_versions(object_name)
            all_replicas = set(obj_meta["replicas"])
            for h in history:
                all_replicas.update(h["replicas"])
            replicas = list(all_replicas)
            target_rf = obj_meta.get("replication_factor", len(replicas))

        replica_details: List[ReplicaIntegrityDetail] = []
        healthy_count = 0
        corrupted_count = 0
        missing_count = 0
        stale_count = 0

        for node_name in replicas:
            detail = self.verify_replica(
                object_name=object_name,
                node_name=node_name,
                expected_checksum=expected_checksum,
                version=target_version,
            )
            replica_details.append(detail)
            if detail.status == "healthy":
                healthy_count += 1
            elif detail.status == "corrupted":
                corrupted_count += 1
            elif detail.status == "missing":
                missing_count += 1
            elif detail.status == "stale":
                stale_count += 1

        is_healthy = (
            healthy_count >= target_rf
            and corrupted_count == 0
            and missing_count == 0
            and stale_count == 0
        )

        return ObjectIntegrityReport(
            object_name=object_name,
            version=target_version,
            expected_checksum=expected_checksum,
            is_healthy=is_healthy,
            total_replicas=target_rf,
            healthy_count=healthy_count,
            corrupted_count=corrupted_count,
            missing_count=missing_count,
            stale_count=stale_count,
            replicas=replica_details,
        )

    def scrub_cluster(self) -> ClusterScrubReport:
        """Run a cluster-wide integrity scrub verifying all stored objects."""
        all_objects = self.metadata_manager.list_objects()
        reports: List[ObjectIntegrityReport] = []
        healthy_objects = 0
        corrupted_objects = 0

        for obj in all_objects:
            try:
                report = self.verify_object_integrity(obj["object_name"])
                reports.append(report)
                if report.is_healthy:
                    healthy_objects += 1
                else:
                    corrupted_objects += 1
            except Exception as e:
                logger.error("Scrub failed for object '%s': %s", obj["object_name"], str(e))

        logger.info(
            "Cluster scrub complete: %d objects scanned (%d healthy, %d corrupted/degraded)",
            len(all_objects),
            healthy_objects,
            corrupted_objects,
        )
        return ClusterScrubReport(
            total_scanned=len(all_objects),
            healthy_count=healthy_objects,
            corrupted_count=corrupted_objects,
            details=reports,
        )


integrity_manager = IntegrityManager()
