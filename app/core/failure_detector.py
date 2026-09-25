import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.config import settings
from app.models.schemas import ClusterHealthReport, NodeHealthCheck
from app.storage.node import NodeOfflineError, NodePartitionedError, StorageNode
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.failure_detector")


class FailureDetector:
    """Monitors, probes, and classifies the health, latency, and failure states of storage nodes."""

    def __init__(self, st_manager: Optional[StorageManager] = None):
        self.storage_manager = st_manager or storage_manager
        self._consecutive_failures: Dict[str, int] = {}
        self._last_heartbeats: Dict[str, str] = {}
        self._previous_states: Dict[str, str] = {}

    def probe_node(self, node_name: str) -> NodeHealthCheck:
        """Actively probe a storage node, measure latency, and update failure statistics."""
        try:
            node = self.storage_manager.get_node(node_name)
        except KeyError:
            return NodeHealthCheck(
                node_name=node_name,
                status="offline",
                is_online=False,
                error_message="Node not registered in cluster",
            )

        start_time = time.perf_counter()
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            # Check online status and measure responsiveness
            if not node.is_online:
                raise NodeOfflineError("Node is administratively marked offline/crashed")
            if node.is_partitioned:
                raise NodePartitionedError("Node is isolated by network partition")

            # I/O health probe
            stats = node.get_storage_stats()
            if not stats["accessible"]:
                raise IOError(f"Storage path {stats['path']} is not accessible/writable")

            # Check simulated delay
            if node.simulated_delay > 0:
                time.sleep(node.simulated_delay)

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            # Success: reset consecutive failures
            self._consecutive_failures[node_name] = 0
            self._last_heartbeats[node_name] = now_iso

            is_slow = elapsed_ms >= settings.SLOW_NODE_THRESHOLD_MS
            current_status = "slow" if is_slow else "healthy"

            # State transition logging
            prev = self._previous_states.get(node_name, "healthy")
            if prev in ("offline", "partitioned", "degraded") and current_status == "healthy":
                logger.info("Node %s recovered", node_name)
            self._previous_states[node_name] = current_status

            return NodeHealthCheck(
                node_name=node_name,
                status=current_status,
                is_online=True,
                is_slow=is_slow,
                is_partitioned=False,
                latency_ms=round(elapsed_ms, 2),
                consecutive_failures=0,
                last_heartbeat=now_iso,
            )

        except NodePartitionedError as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            self._consecutive_failures[node_name] = self._consecutive_failures.get(node_name, 0) + 1
            logger.warning("Node %s unavailable: %s", node_name, str(e))
            self._previous_states[node_name] = "partitioned"

            return NodeHealthCheck(
                node_name=node_name,
                status="partitioned",
                is_online=True,
                is_partitioned=True,
                latency_ms=round(elapsed_ms, 2),
                consecutive_failures=self._consecutive_failures[node_name],
                last_heartbeat=self._last_heartbeats.get(node_name),
                error_message=str(e),
            )

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            self._consecutive_failures[node_name] = self._consecutive_failures.get(node_name, 0) + 1
            logger.warning("Node %s unavailable: %s", node_name, str(e))
            self._previous_states[node_name] = "offline"

            return NodeHealthCheck(
                node_name=node_name,
                status="offline",
                is_online=False,
                latency_ms=round(elapsed_ms, 2),
                consecutive_failures=self._consecutive_failures[node_name],
                last_heartbeat=self._last_heartbeats.get(node_name),
                error_message=str(e),
            )

    def check_cluster_health(self) -> ClusterHealthReport:
        """Run health probes across all cluster nodes and summarize cluster availability."""
        all_nodes = self.storage_manager.list_nodes()
        checks: List[NodeHealthCheck] = []
        healthy_nodes = 0
        failed_nodes = 0
        slow_nodes = 0

        for node in all_nodes:
            check = self.probe_node(node.node_name)
            checks.append(check)
            if check.status == "healthy":
                healthy_nodes += 1
            elif check.status in ("offline", "partitioned"):
                failed_nodes += 1
            elif check.status == "slow":
                slow_nodes += 1
                # Slow node is still accessible, but degraded
                healthy_nodes += 1

        total = len(all_nodes)
        online_count = sum(1 for c in checks if c.is_online and not c.is_partitioned)

        if online_count == total and slow_nodes == 0:
            cluster_status = "healthy"
        elif online_count >= settings.DEFAULT_REPLICATION_FACTOR:
            cluster_status = "degraded"
        else:
            cluster_status = "critical"

        return ClusterHealthReport(
            cluster_status=cluster_status,
            total_nodes=total,
            healthy_nodes=healthy_nodes,
            failed_nodes=failed_nodes,
            slow_nodes=slow_nodes,
            node_checks=checks,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def set_node_slow(self, node_name: str, delay_seconds: float) -> NodeHealthCheck:
        """Configure simulated latency delay for a node."""
        node = self.storage_manager.get_node(node_name)
        node.simulated_delay = delay_seconds
        logger.info("Node '%s' simulated delay set to %.2fs", node_name, delay_seconds)
        return self.probe_node(node_name)

    def set_node_partitioned(self, node_name: str, is_partitioned: bool) -> NodeHealthCheck:
        """Toggle network partition simulation for a node."""
        node = self.storage_manager.get_node(node_name)
        node.is_partitioned = is_partitioned
        logger.info("Node '%s' network partition set to %s", node_name, is_partitioned)
        return self.probe_node(node_name)

    def reset(self) -> None:
        """Clear failure counts and previous states (used in tests)."""
        self._consecutive_failures.clear()
        self._last_heartbeats.clear()
        self._previous_states.clear()


failure_detector = FailureDetector()
