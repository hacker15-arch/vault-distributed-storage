import hashlib
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from app.config import settings
from app.core.metadata import MetadataManager, metadata_manager
from app.models.schemas import (
    NodeUtilizationInfo,
    RebalanceActionDetail,
    RebalanceReport,
)
from app.storage.node import StorageNode
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.rebalance")


class RebalanceManager:
    """Manages cluster storage utilization tracking, load distribution, and background rebalancing."""

    def __init__(
        self,
        st_manager: Optional[StorageManager] = None,
        meta_mgr: Optional[MetadataManager] = None,
    ):
        self.storage_manager = st_manager or storage_manager
        self.metadata_manager = meta_mgr or metadata_manager
        self._is_rebalancing = False
        self._lock = threading.Lock()

    def get_node_utilization(self, node: StorageNode) -> NodeUtilizationInfo:
        """Calculate stored bytes, object count, and storage utilization for a node."""
        if not node.is_online or node.is_partitioned:
            return NodeUtilizationInfo(
                node_name=node.node_name,
                is_online=node.is_online and not node.is_partitioned,
                object_count=0,
                bytes_used=0,
                utilization_percentage=0.0,
            )

        total_bytes = 0
        file_count = 0
        try:
            for file_path in node.root_path.glob("**/*"):
                if (
                    file_path.is_file()
                    and not file_path.name.startswith(".tmp_")
                    and ".versions" not in file_path.parts
                    and ".vmeta" not in file_path.parts
                ):
                    total_bytes += file_path.stat().st_size
                    file_count += 1
        except Exception:
            pass

        stats = node.get_storage_stats()
        free_bytes = stats.get("free_space_bytes")
        total_space = stats.get("total_space_bytes") or (100 * 1024 * 1024 * 1024)  # Default 100GB
        util_pct = round((total_bytes / total_space) * 100.0, 4) if total_space else 0.0

        return NodeUtilizationInfo(
            node_name=node.node_name,
            is_online=True,
            object_count=file_count,
            bytes_used=total_bytes,
            free_space_bytes=free_bytes,
            utilization_percentage=util_pct,
        )

    def analyze_cluster_utilization(self) -> List[NodeUtilizationInfo]:
        """Analyze storage utilization across all nodes in the cluster."""
        all_nodes = self.storage_manager.list_nodes()
        return [self.get_node_utilization(n) for n in all_nodes]

    def is_rebalance_in_progress(self) -> bool:
        """Check whether a rebalancing operation is currently running."""
        with self._lock:
            return self._is_rebalancing

    def rebalance_cluster(self, max_migrations: int = 50) -> RebalanceReport:
        """
        Analyze storage utilization, identify overloaded and underloaded nodes,
        and migrate object replicas to balance cluster storage distribution.
        """
        now_start = datetime.now(timezone.utc).isoformat()

        # Prevent concurrent rebalancing runs
        with self._lock:
            if self._is_rebalancing:
                logger.info("Rebalancing operation already in progress, skipping")
                initial_util = self.analyze_cluster_utilization()
                return RebalanceReport(
                    status="in_progress",
                    imbalance_detected=False,
                    initial_utilization=initial_util,
                    final_utilization=initial_util,
                    objects_moved=0,
                    bytes_transferred=0,
                    actions=[],
                    started_at=now_start,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )
            self._is_rebalancing = True

        logger.info("Rebalancing started: analyzing cluster utilization")

        try:
            initial_util = self.analyze_cluster_utilization()
            online_utils = [u for u in initial_util if u.is_online]

            if not online_utils or len(online_utils) < 2:
                logger.info("Rebalancing skipped: insufficient online nodes for rebalancing")
                return RebalanceReport(
                    status="balanced",
                    imbalance_detected=False,
                    initial_utilization=initial_util,
                    final_utilization=initial_util,
                    objects_moved=0,
                    bytes_transferred=0,
                    actions=[],
                    started_at=now_start,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )

            total_cluster_bytes = sum(u.bytes_used for u in online_utils)
            mean_bytes_per_node = total_cluster_bytes / len(online_utils)

            # Node is overloaded if its usage exceeds mean_bytes by at least 15% or 100 bytes
            imbalance_delta = max(100, int(mean_bytes_per_node * 0.15))
            overloaded = [u for u in online_utils if u.bytes_used > (mean_bytes_per_node + imbalance_delta)]
            underloaded = [u for u in online_utils if u.bytes_used < (mean_bytes_per_node - imbalance_delta)]

            # If no node has significant imbalance
            if not overloaded or not underloaded:
                logger.info("Rebalancing completed: cluster storage is evenly balanced")
                return RebalanceReport(
                    status="balanced",
                    imbalance_detected=False,
                    initial_utilization=initial_util,
                    final_utilization=initial_util,
                    objects_moved=0,
                    bytes_transferred=0,
                    actions=[],
                    started_at=now_start,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )

            # Sort overloaded by usage descending, underloaded by usage ascending
            overloaded.sort(key=lambda u: u.bytes_used, reverse=True)
            underloaded.sort(key=lambda u: u.bytes_used)

            actions: List[RebalanceActionDetail] = []
            objects_moved = 0
            bytes_transferred = 0

            # Dynamic tracking of node byte usage during rebalance migration
            current_bytes: Dict[str, int] = {u.node_name: u.bytes_used for u in online_utils}

            for source_util in overloaded:
                if objects_moved >= max_migrations:
                    break

                source_node_name = source_util.node_name
                try:
                    source_node = self.storage_manager.get_node(source_node_name)
                    stored_objs = source_node.list_objects()
                except Exception as e:
                    logger.warning("Error listing objects on node %s: %s", source_node_name, str(e))
                    continue

                for obj in stored_objs:
                    if objects_moved >= max_migrations:
                        break
                    if current_bytes[source_node_name] <= mean_bytes_per_node:
                        break  # Source node is no longer overloaded

                    object_name = obj.object_name
                    obj_meta = self.metadata_manager.get_object(object_name)
                    if not obj_meta:
                        continue

                    current_version = obj_meta["current_version"]
                    existing_replicas = set(obj_meta["replicas"])

                    # Find a target underloaded node that does not already hold a replica
                    target_candidate = None
                    for target_util in underloaded:
                        t_name = target_util.node_name
                        if t_name not in existing_replicas and current_bytes[t_name] < mean_bytes_per_node:
                            try:
                                target_node_obj = self.storage_manager.get_node(t_name)
                                if target_node_obj.is_online and not target_node_obj.is_partitioned:
                                    target_candidate = target_node_obj
                                    break
                            except Exception:
                                continue

                    if not target_candidate:
                        continue  # No eligible underloaded node found for this object

                    target_name = target_candidate.node_name

                    # Execute migration: copy to target node, verify integrity, then remove from source node
                    try:
                        data = source_node.read_object_bytes(object_name, version=current_version)
                        chk = hashlib.sha256(data).hexdigest()

                        # Write to target node
                        target_candidate.write_object(
                            object_name,
                            data,
                            version=current_version,
                            checksum=chk,
                        )

                        # Delete replica from overloaded source node
                        source_node.delete_object(object_name)

                        # Update metadata database catalog
                        new_replicas = [r for r in obj_meta["replicas"] if r != source_node_name] + [target_name]
                        self.metadata_manager.update_version_replicas(
                            object_name, current_version, new_replicas
                        )

                        # Update local metrics
                        obj_bytes = len(data)
                        current_bytes[source_node_name] -= obj_bytes
                        current_bytes[target_name] += obj_bytes
                        bytes_transferred += obj_bytes
                        objects_moved += 1

                        actions.append(
                            RebalanceActionDetail(
                                object_name=object_name,
                                version=current_version,
                                source_node=source_node_name,
                                target_node=target_name,
                                bytes_moved=obj_bytes,
                                status="success",
                            )
                        )
                        logger.info(
                            "Rebalanced '%s' (v%d): migrated %d bytes from %s to %s",
                            object_name,
                            current_version,
                            obj_bytes,
                            source_node_name,
                            target_name,
                        )

                    except Exception as e:
                        logger.error("Failed to migrate '%s' from %s to %s: %s", object_name, source_node_name, target_name, str(e))
                        actions.append(
                            RebalanceActionDetail(
                                object_name=object_name,
                                version=current_version,
                                source_node=source_node_name,
                                target_node=target_name,
                                bytes_moved=0,
                                status="failed",
                                error_message=str(e),
                            )
                        )

            final_util = self.analyze_cluster_utilization()
            status_str = "rebalanced" if objects_moved > 0 else "balanced"

            logger.info(
                "Rebalancing completed: moved %d object(s), transferred %d bytes across cluster",
                objects_moved,
                bytes_transferred,
            )

            return RebalanceReport(
                status=status_str,
                imbalance_detected=len(overloaded) > 0,
                initial_utilization=initial_util,
                final_utilization=final_util,
                objects_moved=objects_moved,
                bytes_transferred=bytes_transferred,
                actions=actions,
                started_at=now_start,
                completed_at=datetime.now(timezone.utc).isoformat(),
            )

        finally:
            with self._lock:
                self._is_rebalancing = False


rebalance_manager = RebalanceManager()
