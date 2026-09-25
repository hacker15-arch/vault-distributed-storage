import logging
from typing import Any, Dict, List, Optional

from app.config import settings
from app.core.repair import repair_manager
from app.storage.node import StorageNode
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.partition")


class SplitBrainFencingError(Exception):
    """Raised when an operation is blocked by split-brain fencing on a minority network partition."""

    def __init__(self, message: str, active_count: int, majority_threshold: int):
        super().__init__(message)
        self.active_count = active_count
        self.majority_threshold = majority_threshold


class PartitionManager:
    """Manages network partition simulation, split-brain fencing, and post-partition healing."""

    def __init__(self, st_manager: Optional[StorageManager] = None):
        self.storage_manager = st_manager or storage_manager

    def partition_node(self, node_name: str) -> Dict[str, Any]:
        """Isolate a node by marking it as network partitioned."""
        node = self.storage_manager.get_node(node_name)
        node.is_partitioned = True
        logger.warning("Node '%s' network partition activated (isolated from cluster)", node_name)
        return {
            "node_name": node_name,
            "status": "partitioned",
            "is_online": node.is_online,
            "is_partitioned": True,
        }

    def unpartition_node(self, node_name: str) -> Dict[str, Any]:
        """Heal network partition for a single node."""
        node = self.storage_manager.get_node(node_name)
        node.is_partitioned = False
        logger.info("Node '%s' network partition healed (re-joined cluster)", node_name)
        return {
            "node_name": node_name,
            "status": "healthy" if node.is_online else "offline",
            "is_online": node.is_online,
            "is_partitioned": False,
        }

    def simulate_split_brain(
        self, partition_a: List[str], partition_b: List[str]
    ) -> Dict[str, Any]:
        """Simulate a split-brain network partition dividing nodes into two isolated segments."""
        all_nodes = self.storage_manager.list_nodes()

        # Isolate partition_a nodes
        for node in all_nodes:
            if node.node_name in partition_a:
                node.is_partitioned = True
            elif node.node_name in partition_b:
                node.is_partitioned = False

        logger.warning(
            "Split-brain partition simulated: Group A (Isolated)=%s, Group B (Connected)=%s",
            partition_a,
            partition_b,
        )
        return {
            "partition_a": partition_a,
            "partition_b": partition_b,
            "status": "partitioned",
        }

    def heal_cluster(self) -> Dict[str, Any]:
        """Heal all network partitions across the cluster and run post-partition resynchronization."""
        healed_nodes = []
        for node in self.storage_manager.list_nodes():
            if node.is_partitioned:
                node.is_partitioned = False
                healed_nodes.append(node.node_name)

        logger.info("Cluster partitions healed for nodes: %s. Initiating resynchronization...", healed_nodes)

        # Trigger cluster-wide self-healing repair after network partition heals
        repair_report = repair_manager.repair_cluster()

        return {
            "status": "healed",
            "healed_nodes": healed_nodes,
            "resync_report": repair_report,
        }

    def get_partition_status(self) -> Dict[str, Any]:
        """Return current network partition matrix, total nodes, and active connected node count."""
        all_nodes = self.storage_manager.list_nodes()
        connected = [n.node_name for n in all_nodes if n.is_online and not n.is_partitioned]
        partitioned = [n.node_name for n in all_nodes if n.is_partitioned]
        crashed = [n.node_name for n in all_nodes if not n.is_online]

        majority_threshold = (len(all_nodes) // 2) + 1
        has_majority = len(connected) >= majority_threshold

        return {
            "total_nodes": len(all_nodes),
            "connected_nodes": connected,
            "partitioned_nodes": partitioned,
            "crashed_nodes": crashed,
            "majority_threshold": majority_threshold,
            "has_majority": has_majority,
            "fenced": not has_majority,
        }

    def verify_split_brain_fencing(self, active_nodes: List[str]) -> None:
        """Enforce split-brain write fencing. Operations on a minority partition are rejected."""
        all_nodes = self.storage_manager.list_nodes()
        majority_threshold = (len(all_nodes) // 2) + 1
        active_count = len(active_nodes)

        if active_count < majority_threshold:
            msg = (
                f"Split-brain write fencing active: connected nodes ({active_count}) "
                f"do not meet cluster majority quorum ({majority_threshold}). Writes blocked to prevent split-brain divergence."
            )
            logger.error(msg)
            raise SplitBrainFencingError(
                msg, active_count=active_count, majority_threshold=majority_threshold
            )


partition_manager = PartitionManager()
