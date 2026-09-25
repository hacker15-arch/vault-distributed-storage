from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.core.failure_detector import failure_detector
from app.core.integrity import integrity_manager
from app.core.lock_manager import lock_manager
from app.models.schemas import (
    ClusterHealthReport,
    ClusterRepairReport,
    ClusterScrubReport,
    NodeHealthCheck,
    ObjectIntegrityReport,
    RebalanceReport,
    RepairReport,
    SlowNodeSimulation,
    SplitBrainSimulationRequest,
)
from app.storage.storage_manager import storage_manager

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/health/cluster", response_model=ClusterHealthReport)
async def get_cluster_health():
    """Retrieve active failure detector analysis and health report across all nodes."""
    return failure_detector.check_cluster_health()


@router.post("/health/probe", response_model=ClusterHealthReport)
async def trigger_health_probe():
    """Trigger an immediate active probe of all nodes."""
    return failure_detector.check_cluster_health()


@router.get("/nodes/{node_name}/health", response_model=NodeHealthCheck)
async def probe_single_node(node_name: str):
    """Probe a single storage node and measure latency/failure state."""
    return failure_detector.probe_node(node_name)


@router.post("/nodes/{node_name}/slow", response_model=NodeHealthCheck)
async def simulate_slow_node(node_name: str, payload: SlowNodeSimulation):
    """Simulate disk/network latency delay on a storage node."""
    try:
        return failure_detector.set_node_slow(node_name, payload.delay_seconds)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found",
        )


@router.post("/nodes/{node_name}/partition", response_model=NodeHealthCheck)
async def simulate_partition(node_name: str):
    """Simulate a network partition isolating a storage node."""
    try:
        return failure_detector.set_node_partitioned(node_name, is_partitioned=True)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found",
        )


@router.post("/nodes/{node_name}/unpartition", response_model=NodeHealthCheck)
async def remove_partition(node_name: str):
    """Restore network connectivity for a partitioned storage node."""
    try:
        return failure_detector.set_node_partitioned(node_name, is_partitioned=False)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found",
        )


@router.get("/partition/status")
async def get_partition_status():
    """Get active network partition matrix, connected node counts, and split-brain fencing status."""
    from app.core.partition import partition_manager
    return partition_manager.get_partition_status()


@router.post("/partition/simulate")
async def simulate_split_brain_partition(payload: SplitBrainSimulationRequest):
    """Simulate a split-brain network partition isolating node groups."""
    from app.core.partition import partition_manager
    return partition_manager.simulate_split_brain(
        partition_a=payload.partition_a, partition_b=payload.partition_b
    )


@router.post("/partition/heal")
async def heal_all_partitions():
    """Heal all network partitions across the cluster and trigger post-partition resynchronization repair."""
    from app.core.partition import partition_manager
    return partition_manager.heal_cluster()


@router.post("/nodes/{node_name}/corrupt/{object_name:path}")
async def corrupt_replica(
    node_name: str,
    object_name: str,
    version: Optional[int] = Query(None, ge=1),
):
    """Simulate disk corruption/bit-rot on a specific node's replica."""
    try:
        node = storage_manager.get_node(node_name)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found",
        )

    if not node.is_online:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Node '{node_name}' is currently offline",
        )

    async with lock_manager.write_lock(object_name):
        success = node.corrupt_object(object_name, version=version)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Object '{object_name}' not found on node '{node_name}' to corrupt",
            )

        return {
            "status": "corrupted",
            "node_name": node_name,
            "object_name": object_name,
            "version": version or "current",
            "message": f"Successfully simulated byte corruption on node '{node_name}' for '{object_name}'",
        }


@router.post("/scrub", response_model=ClusterScrubReport)
async def run_cluster_scrub():
    """Run an on-demand cluster-wide integrity scrub verifying all object replicas."""
    report = integrity_manager.scrub_cluster()
    return report


@router.post("/repair/{object_name:path}", response_model=RepairReport)
async def repair_single_object(object_name: str, version: Optional[int] = Query(None, ge=1)):
    """Trigger automatic self-healing repair for an object."""
    from app.core.repair import repair_manager
    async with lock_manager.write_lock(object_name):
        report = repair_manager.repair_object(object_name, version=version)
        return report


@router.post("/repair", response_model=ClusterRepairReport)
async def repair_cluster_objects():
    """Trigger cluster-wide automated repair scan for all degraded objects."""
    from app.core.repair import repair_manager
    return repair_manager.repair_cluster()


@router.get("/repair/status")
async def get_repair_status():
    """Get active in-progress replica repair operations."""
    from app.core.repair import repair_manager
    return repair_manager.get_repair_status()


@router.get("/rebalance/status")
async def get_rebalance_status():
    """Get cluster storage utilization analysis across nodes and rebalancing status."""
    from app.core.rebalance import rebalance_manager
    utilization = rebalance_manager.analyze_cluster_utilization()
    in_progress = rebalance_manager.is_rebalance_in_progress()
    return {
        "in_progress": in_progress,
        "total_nodes": len(utilization),
        "online_nodes": sum(1 for u in utilization if u.is_online),
        "utilization": utilization,
    }


@router.post("/rebalance", response_model=RebalanceReport)
async def trigger_rebalance():
    """Trigger an on-demand cluster storage rebalancing operation."""
    from app.core.rebalance import rebalance_manager
    return rebalance_manager.rebalance_cluster()
