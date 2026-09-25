import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from app.config import settings
from app.core.integrity import IntegrityManager, integrity_manager
from app.core.metadata import MetadataManager, metadata_manager
from app.models.schemas import (
    ClusterRepairReport,
    RepairReport,
    ReplicaRepairAction,
)
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.repair")


class RepairManager:
    """Manages automatic self-healing replica repairs and data re-replication."""

    def __init__(
        self,
        st_manager: Optional[StorageManager] = None,
        meta_mgr: Optional[MetadataManager] = None,
        integ_mgr: Optional[IntegrityManager] = None,
    ):
        self.storage_manager = st_manager or storage_manager
        self.metadata_manager = meta_mgr or metadata_manager
        self.integrity_manager = integ_mgr or integrity_manager
        self._in_progress_repairs: Set[str] = set()
        self._lock = threading.Lock()

    def is_repair_in_progress(self, object_name: str) -> bool:
        """Check whether a repair is currently running for an object."""
        with self._lock:
            return object_name in self._in_progress_repairs

    def get_repair_status(self) -> Dict[str, object]:
        """Return currently active repairs."""
        with self._lock:
            return {
                "active_repairs": sorted(list(self._in_progress_repairs)),
                "in_progress_count": len(self._in_progress_repairs),
            }

    def repair_object(
        self, object_name: str, version: Optional[int] = None
    ) -> RepairReport:
        """Heal an object's replicas (in-place repair for corruption or replacement on a new node)."""
        now_start = datetime.now(timezone.utc).isoformat()

        # 1. Prevent duplicate concurrent repairs on the same object (Requirement 13)
        with self._lock:
            if object_name in self._in_progress_repairs:
                logger.info("Repair already in progress for '%s', skipping", object_name)
                return RepairReport(
                    object_name=object_name,
                    version=version or 1,
                    status="in_progress",
                    initial_healthy_count=0,
                    final_healthy_count=0,
                    target_replication_factor=settings.DEFAULT_REPLICATION_FACTOR,
                    actions=[],
                    started_at=now_start,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )
            self._in_progress_repairs.add(object_name)

        logger.info("Repair started: %s", object_name)

        try:
            # 2. Check current integrity
            integ_report = self.integrity_manager.verify_object_integrity(
                object_name, version=version
            )
            target_version = integ_report.version
            expected_checksum = integ_report.expected_checksum
            target_rf = integ_report.total_replicas
            initial_healthy = integ_report.healthy_count

            # If object is already fully healthy across all required replicas
            if integ_report.is_healthy and initial_healthy >= target_rf:
                logger.info("Repair completed: %s (already healthy)", object_name)
                return RepairReport(
                    object_name=object_name,
                    version=target_version,
                    status="already_healthy",
                    initial_healthy_count=initial_healthy,
                    final_healthy_count=initial_healthy,
                    target_replication_factor=target_rf,
                    actions=[],
                    started_at=now_start,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )

            # 3. Locate a verified healthy source replica
            healthy_sources = [
                r.node_name for r in integ_report.replicas if r.status == "healthy"
            ]
            if not healthy_sources:
                logger.error(
                    "Repair failed for '%s': no healthy source replica available",
                    object_name,
                )
                return RepairReport(
                    object_name=object_name,
                    version=target_version,
                    status="failed",
                    initial_healthy_count=0,
                    final_healthy_count=0,
                    target_replication_factor=target_rf,
                    actions=[],
                    started_at=now_start,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )

            source_node_name = healthy_sources[0]
            source_node = self.storage_manager.get_node(source_node_name)
            verified_payload = source_node.read_object_bytes(
                object_name, version=target_version
            )

            actions: List[ReplicaRepairAction] = []
            active_healthy_nodes = list(healthy_sources)

            # 4. Action A: In-place repair of corrupted or stale replicas on online nodes
            for rep in integ_report.replicas:
                if rep.status in ("corrupted", "stale"):
                    try:
                        node = self.storage_manager.get_node(rep.node_name)
                        if node.is_online and not node.is_partitioned:
                            node.write_object(
                                object_name,
                                verified_payload,
                                version=target_version,
                                checksum=expected_checksum,
                            )
                            self.metadata_manager.update_replica_status(
                                object_name, target_version, node.node_name, "healthy"
                            )
                            active_healthy_nodes.append(node.node_name)
                            actions.append(
                                ReplicaRepairAction(
                                    action_type="repaired_corrupted_in_place",
                                    target_node=node.node_name,
                                    source_node=source_node_name,
                                    status="success",
                                )
                            )
                            logger.info(
                                "Replaced corrupted replica on %s for %s",
                                node.node_name,
                                object_name,
                            )
                    except Exception as e:
                        actions.append(
                            ReplicaRepairAction(
                                action_type="repaired_corrupted_in_place",
                                target_node=rep.node_name,
                                source_node=source_node_name,
                                status="failed",
                                error_message=str(e),
                            )
                        )

            # 5. Action B: Re-replicate to a new healthy node if replicas are missing or nodes failed
            current_healthy_unique = list(dict.fromkeys(active_healthy_nodes))
            needed = target_rf - len(current_healthy_unique)

            if needed > 0:
                online_nodes = self.storage_manager.get_online_nodes()
                candidates = [
                    n
                    for n in online_nodes
                    if n.node_name not in current_healthy_unique
                    and not n.is_partitioned
                ]

                # Select replacement nodes
                for new_node in candidates[:needed]:
                    try:
                        new_node.write_object(
                            object_name,
                            verified_payload,
                            version=target_version,
                            checksum=expected_checksum,
                        )
                        self.metadata_manager.update_replica_status(
                            object_name, target_version, new_node.node_name, "healthy"
                        )
                        current_healthy_unique.append(new_node.node_name)
                        actions.append(
                            ReplicaRepairAction(
                                action_type="replicated_to_new_node",
                                target_node=new_node.node_name,
                                source_node=source_node_name,
                                status="success",
                            )
                        )
                        logger.info(
                            "Created repaired replica: %s on %s (replacing failed node)",
                            object_name,
                            new_node.node_name,
                        )
                    except Exception as e:
                        actions.append(
                            ReplicaRepairAction(
                                action_type="replicated_to_new_node",
                                target_node=new_node.node_name,
                                source_node=source_node_name,
                                status="failed",
                                error_message=str(e),
                            )
                        )

                # Update metadata catalog with the new healthy replica list
                self.metadata_manager.update_version_replicas(
                    object_name, target_version, current_healthy_unique
                )

            # 6. Final verification check
            final_report = self.integrity_manager.verify_object_integrity(
                object_name, version=target_version
            )
            logger.info("Repair completed: %s", object_name)

            return RepairReport(
                object_name=object_name,
                version=target_version,
                status="repaired",
                initial_healthy_count=initial_healthy,
                final_healthy_count=final_report.healthy_count,
                target_replication_factor=target_rf,
                actions=actions,
                started_at=now_start,
                completed_at=datetime.now(timezone.utc).isoformat(),
            )

        finally:
            with self._lock:
                self._in_progress_repairs.discard(object_name)

    def repair_cluster(self) -> ClusterRepairReport:
        """Scan all objects in the cluster and trigger automatic repair for degraded objects."""
        all_objects = self.metadata_manager.list_objects()
        reports: List[RepairReport] = []
        repaired = 0
        healthy = 0
        failed = 0

        for obj in all_objects:
            name = obj["object_name"]
            try:
                rep = self.repair_object(name)
                reports.append(rep)
                if rep.status == "repaired":
                    repaired += 1
                elif rep.status == "already_healthy":
                    healthy += 1
                else:
                    failed += 1
            except Exception as e:
                logger.error("Failed to repair object '%s': %s", name, str(e))
                failed += 1

        logger.info(
            "Cluster repair scan finished: %d total, %d repaired, %d healthy, %d failed",
            len(all_objects),
            repaired,
            healthy,
            failed,
        )
        return ClusterRepairReport(
            total_scanned=len(all_objects),
            repaired_count=repaired,
            healthy_count=healthy,
            failed_count=failed,
            reports=reports,
        )


repair_manager = RepairManager()
