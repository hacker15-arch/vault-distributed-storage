from fastapi import APIRouter, HTTPException, status

from app.models.schemas import NodeInfo, NodeListResponse, NodeStatusUpdate
from app.storage.storage_manager import storage_manager

router = APIRouter(prefix="/nodes", tags=["Nodes"])


def _build_node_info(node) -> NodeInfo:
    stats = node.get_storage_stats()
    try:
        obj_count = len(node.list_objects()) if node.is_online else 0
    except Exception:
        obj_count = 0

    return NodeInfo(
        node_name=node.node_name,
        path=stats["path"],
        is_online=node.is_online,
        accessible=stats["accessible"],
        object_count=obj_count,
        total_space_bytes=stats["total_space_bytes"],
        free_space_bytes=stats["free_space_bytes"],
    )


@router.get("", response_model=NodeListResponse)
async def list_nodes():
    """List all registered storage nodes and their statuses."""
    all_nodes = storage_manager.list_nodes()
    node_infos = [_build_node_info(n) for n in all_nodes]
    online_count = sum(1 for n in node_infos if n.is_online)

    return NodeListResponse(
        count=len(node_infos),
        online_count=online_count,
        nodes=node_infos,
    )


@router.get("/{node_name}", response_model=NodeInfo)
async def get_node_details(node_name: str):
    """Get operational status and stats for a specific node."""
    try:
        node = storage_manager.get_node(node_name)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found in cluster",
        )
    return _build_node_info(node)


@router.post("/{node_name}/online", response_model=NodeInfo)
async def set_node_online(node_name: str):
    """Mark a storage node as ONLINE."""
    try:
        node = storage_manager.set_node_online_status(node_name, is_online=True)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found in cluster",
        )
    return _build_node_info(node)


@router.post("/{node_name}/offline", response_model=NodeInfo)
async def set_node_offline(node_name: str):
    """Mark a storage node as OFFLINE (simulating network partition or server outage)."""
    try:
        node = storage_manager.set_node_online_status(node_name, is_online=False)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found in cluster",
        )
    return _build_node_info(node)


@router.put("/{node_name}/status", response_model=NodeInfo)
async def update_node_status(node_name: str, update: NodeStatusUpdate):
    """Update node status via request payload."""
    try:
        node = storage_manager.set_node_online_status(node_name, is_online=update.is_online)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_name}' not found in cluster",
        )
    return _build_node_info(node)
