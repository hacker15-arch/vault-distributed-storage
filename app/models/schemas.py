from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class ObjectVersionInfo(BaseModel):
    """Metadata describing a historical version of an object."""

    version: int
    size: int
    checksum: str
    replicas: List[str] = Field(default_factory=list)
    created_at: str


class ObjectHistoryResponse(BaseModel):
    """Full version history for a specific object."""

    object_name: str
    current_version: int
    versions: List[ObjectVersionInfo]


class ObjectMetadata(BaseModel):
    """Metadata describing a stored object across cluster replicas."""

    object_id: Optional[str] = None
    object_name: str
    version: int = 1
    size: int
    checksum: Optional[str] = None
    content_type: str = "application/octet-stream"
    created_at: datetime
    modified_at: datetime
    replicas: List[str] = Field(default_factory=list)
    replication_factor: int = 1


class ObjectUploadResponse(BaseModel):
    """Response returned upon successful object upload and replication."""

    object_id: Optional[str] = None
    object_name: str
    version: int = 1
    size: int
    checksum: Optional[str] = None
    status: str = "stored"
    message: str = "Object uploaded and replicated successfully"
    replicas: List[str] = Field(default_factory=list)
    replication_factor: int = 1


class ObjectDeleteResponse(BaseModel):
    """Response returned upon successful object deletion across replicas."""

    object_name: str
    status: str = "deleted"
    message: str = "Object deleted successfully"
    deleted_from_nodes: List[str] = Field(default_factory=list)


class ObjectListResponse(BaseModel):
    """Response containing a list of stored objects across the cluster."""

    count: int
    objects: List[ObjectMetadata]


class ReplicaIntegrityDetail(BaseModel):
    """Integrity check detail for a single replica node."""

    node_name: str
    status: str  # "healthy", "corrupted", "missing", "stale"
    expected_checksum: str
    actual_checksum: Optional[str] = None
    local_version: Optional[int] = None
    error_message: Optional[str] = None


class ObjectIntegrityReport(BaseModel):
    """Integrity report for an object across all its replicas."""

    object_name: str
    version: int
    expected_checksum: str
    is_healthy: bool
    total_replicas: int
    healthy_count: int
    corrupted_count: int
    missing_count: int
    stale_count: int = 0
    replicas: List[ReplicaIntegrityDetail]


class ClusterScrubReport(BaseModel):
    """Cluster-wide integrity scrub report."""

    total_scanned: int
    healthy_count: int
    corrupted_count: int
    details: List[ObjectIntegrityReport]


class NodeInfo(BaseModel):
    """Status and capacity details for an individual storage node."""

    node_name: str
    path: str
    is_online: bool
    accessible: bool
    object_count: int = 0
    total_space_bytes: Optional[int] = None
    free_space_bytes: Optional[int] = None


class NodeListResponse(BaseModel):
    """List of all storage nodes in the cluster."""

    count: int
    online_count: int
    nodes: List[NodeInfo]


class NodeStatusUpdate(BaseModel):
    """Request payload to set a node online or offline."""

    is_online: bool


class SlowNodeSimulation(BaseModel):
    """Request payload to simulate a slow or lagging node."""

    delay_seconds: float = Field(..., ge=0.0, le=30.0)


class SplitBrainSimulationRequest(BaseModel):
    """Payload to simulate a split-brain partition dividing cluster nodes."""

    partition_a: List[str]
    partition_b: List[str]


class NodeHealthCheck(BaseModel):
    """Health check diagnosis for an individual storage node."""

    node_name: str
    status: str  # "healthy", "slow", "offline", "partitioned"
    is_online: bool
    is_slow: bool = False
    is_partitioned: bool = False
    latency_ms: float = 0.0
    consecutive_failures: int = 0
    last_heartbeat: Optional[str] = None
    error_message: Optional[str] = None


class ClusterHealthReport(BaseModel):
    """Comprehensive failure detector report for all cluster nodes."""

    cluster_status: str  # "healthy", "degraded", "critical"
    total_nodes: int
    healthy_nodes: int
    failed_nodes: int
    slow_nodes: int
    node_checks: List[NodeHealthCheck]
    timestamp: str


class ReplicaRepairAction(BaseModel):
    """Details of an individual replica repair action."""

    action_type: str  # "repaired_corrupted_in_place", "replicated_to_new_node", "restored_missing"
    target_node: str
    source_node: str
    status: str  # "success", "failed"
    error_message: Optional[str] = None


class RepairReport(BaseModel):
    """Report detailing an object's repair process and resulting health state."""

    object_name: str
    version: int
    status: str  # "repaired", "already_healthy", "in_progress", "failed"
    initial_healthy_count: int
    final_healthy_count: int
    target_replication_factor: int
    actions: List[ReplicaRepairAction] = Field(default_factory=list)
    started_at: str
    completed_at: str


class ClusterRepairReport(BaseModel):
    """Cluster-wide self-healing repair summary."""

    total_scanned: int
    repaired_count: int
    healthy_count: int
    failed_count: int
    reports: List[RepairReport] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """Health check status for Vault API and the storage cluster."""

    status: str = "healthy"
    version: str
    total_nodes: int
    online_nodes: int
    replication_factor: int
    storage_accessible: bool


class NodeUtilizationInfo(BaseModel):
    """Storage utilization details for an individual node."""

    node_name: str
    is_online: bool
    object_count: int
    bytes_used: int
    free_space_bytes: Optional[int] = None
    utilization_percentage: float = 0.0


class RebalanceActionDetail(BaseModel):
    """Detail of a single replica migration action during rebalancing."""

    object_name: str
    version: int
    source_node: str
    target_node: str
    bytes_moved: int
    status: str  # "success", "failed"
    error_message: Optional[str] = None


class RebalanceReport(BaseModel):
    """Report summarizing cluster rebalancing analysis and execution."""

    status: str  # "balanced", "rebalanced", "in_progress", "failed"
    imbalance_detected: bool
    initial_utilization: List[NodeUtilizationInfo]
    final_utilization: List[NodeUtilizationInfo]
    objects_moved: int
    bytes_transferred: int
    actions: List[RebalanceActionDetail] = Field(default_factory=list)
    started_at: str
    completed_at: str
