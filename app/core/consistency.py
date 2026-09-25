import hashlib
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.core.metadata import MetadataManager, metadata_manager
from app.storage.node import StorageNode
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.consistency")


class QuorumNotSatisfiedError(Exception):
    """Raised when the specified write or read quorum cannot be satisfied."""

    def __init__(self, message: str, actual: int, required: int):
        super().__init__(message)
        self.actual = actual
        self.required = required


class ConsistencyManager:
    """Manages write and read quorum enforcement, quorum validation, and replica read-repair."""

    def __init__(
        self,
        manager: Optional[StorageManager] = None,
        meta_manager: Optional[MetadataManager] = None,
    ):
        self.storage_manager = manager or storage_manager
        self.metadata_manager = meta_manager or metadata_manager

    def validate_quorum(
        self, write_quorum: int, read_quorum: int, replication_factor: int
    ) -> Dict[str, Any]:
        """Validate quorum parameters and determine whether strong consistency is guaranteed."""
        if write_quorum < 1 or read_quorum < 1:
            raise ValueError("Quorum values must be at least 1")
        if write_quorum > replication_factor:
            raise ValueError(
                f"Write quorum ({write_quorum}) cannot exceed replication factor ({replication_factor})"
            )
        if read_quorum > replication_factor:
            raise ValueError(
                f"Read quorum ({read_quorum}) cannot exceed replication factor ({replication_factor})"
            )

        is_strong = (write_quorum + read_quorum) > replication_factor
        return {
            "write_quorum": write_quorum,
            "read_quorum": read_quorum,
            "replication_factor": replication_factor,
            "strong_consistency": is_strong,
            "overlap_nodes": max(0, (write_quorum + read_quorum) - replication_factor),
        }

    def verify_write_quorum(self, successful_nodes: List[str], required_quorum: int) -> None:
        """Verify that actual successful writes meet or exceed the required write quorum."""
        actual = len(successful_nodes)
        if actual < required_quorum:
            msg = f"Write quorum failed: achieved {actual} replica(s), required {required_quorum}"
            logger.warning(msg)
            raise QuorumNotSatisfiedError(msg, actual=actual, required=required_quorum)

    def verify_read_quorum(self, healthy_nodes: List[str], required_quorum: int) -> None:
        """Verify that actual healthy accessible nodes meet or exceed the required read quorum."""
        actual = len(healthy_nodes)
        if actual < required_quorum:
            msg = f"Read quorum failed: achieved {actual} healthy replica(s), required {required_quorum}"
            logger.warning(msg)
            raise QuorumNotSatisfiedError(msg, actual=actual, required=required_quorum)

    def inspect_and_read_repair(
        self,
        object_name: str,
        version: Optional[int] = None,
        read_quorum: Optional[int] = None,
    ) -> Tuple[StorageNode, int, int, int]:
        """
        Inspect candidate replica nodes for an object, enforce read quorum, detect version divergence,
        and trigger inline read-repair for stale or missing replicas.

        Returns:
            Tuple of (donor_node, target_version, actual_healthy_count, required_read_quorum)
        """
        rq = read_quorum or settings.DEFAULT_READ_QUORUM
        obj_meta = self.metadata_manager.get_object(object_name)
        if not obj_meta:
            raise FileNotFoundError(f"Object '{object_name}' not found in metadata catalog")

        if version is not None:
            ver_db = self.metadata_manager.get_object_version(object_name, version)
            if not ver_db:
                raise FileNotFoundError(f"Object '{object_name}' v{version} not found in catalog")
            candidate_node_names = ver_db["replicas"]
            expected_checksum = ver_db["checksum"]
            target_version = version
        else:
            # Include current replicas and any historical replicas from metadata catalog
            history = self.metadata_manager.get_object_versions(object_name)
            all_replicas = set(obj_meta["replicas"])
            for h in history:
                all_replicas.update(h["replicas"])
            candidate_node_names = list(all_replicas)
            expected_checksum = obj_meta["checksum"]
            target_version = obj_meta["current_version"]

        online_nodes = self.storage_manager.get_online_nodes()
        online_map = {n.node_name: n for n in online_nodes}

        node_versions: Dict[str, Tuple[StorageNode, int, str]] = {}
        healthy_nodes: List[str] = []

        # 1. Inspect candidate nodes holding the replica
        for name in candidate_node_names:
            node = online_map.get(name)
            if not node:
                continue
            try:
                if node.object_exists(object_name, version=version):
                    local_ver = node.get_local_version(object_name) if version is None else version
                    data = node.read_object_bytes(object_name, version=version)
                    actual_sum = hashlib.sha256(data).hexdigest()

                    # Retrieve expected checksum for this node's local version
                    local_ver_meta = self.metadata_manager.get_object_version(object_name, local_ver) if local_ver else None
                    exp_sum = local_ver_meta["checksum"] if local_ver_meta else expected_checksum

                    if actual_sum != exp_sum:
                        logger.warning(
                            "Read repair skipped corrupted replica '%s' on %s", object_name, name
                        )
                        self.metadata_manager.update_replica_status(
                            object_name, local_ver or target_version, name, "corrupted"
                        )
                        continue

                    node_versions[name] = (node, local_ver or target_version, actual_sum)
                    healthy_nodes.append(name)
            except Exception as e:
                logger.warning("Error inspecting node %s during read: %s", name, str(e))
                continue

        # 2. Enforce Read Quorum & check if any healthy replica survived
        if not healthy_nodes:
            ver_str = f" (version {version})" if version else ""
            raise FileNotFoundError(f"Object '{object_name}'{ver_str} not found on any online replica node")

        self.verify_read_quorum(healthy_nodes, rq)

        # 3. Select donor node
        if version is not None:
            max_version = target_version
            donor_node, _, donor_checksum = next(
                (node, ver, chk) for node, ver, chk in node_versions.values()
            )
        else:
            max_version = max(ver for _, ver, _ in node_versions.values())
            donor_node, _, donor_checksum = next(
                (node, ver, chk) for node, ver, chk in node_versions.values() if ver == max_version
            )

        donor_data = donor_node.read_object_bytes(object_name, version=max_version)

        # 4. Perform inline read repair ONLY when reading current version and stale/missing replicas exist on candidate nodes
        if version is None:
            repaired_nodes: List[str] = list(healthy_nodes)
            for name in candidate_node_names:
                node = online_map.get(name)
                if not node:
                    continue
                current_local_ver = node_versions[name][1] if name in node_versions else 0
                if current_local_ver < max_version:
                    try:
                        node.write_object(
                            object_name,
                            donor_data,
                            version=max_version,
                            checksum=donor_checksum,
                        )
                        logger.info(
                            "Read repair: updated stale node %s for '%s' from v%d to v%d",
                            name,
                            object_name,
                            current_local_ver,
                            max_version,
                        )
                        if name not in repaired_nodes:
                            repaired_nodes.append(name)
                        self.metadata_manager.update_replica_status(
                            object_name, max_version, name, "healthy"
                        )
                    except Exception as e:
                        logger.error("Read repair failed on node %s: %s", name, str(e))

            if len(repaired_nodes) != len(obj_meta["replicas"]):
                self.metadata_manager.record_object_write(
                    object_name=object_name,
                    size=len(donor_data),
                    checksum=donor_checksum,
                    replication_factor=len(repaired_nodes),
                    replicas=repaired_nodes,
                    content_type=obj_meta.get("content_type") or "application/octet-stream",
                )

        return donor_node, max_version, len(healthy_nodes), rq


consistency_manager = ConsistencyManager()
