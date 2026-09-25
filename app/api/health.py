from fastapi import APIRouter
from app.config import settings
from app.models.schemas import HealthResponse
from app.storage.storage_manager import storage_manager

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Returns cluster operational health, node counts, and replication config."""
    nodes = storage_manager.list_nodes()
    online_nodes = storage_manager.get_online_nodes()

    # Consider healthy if at least replication_factor nodes are online
    is_healthy = len(online_nodes) >= min(settings.DEFAULT_REPLICATION_FACTOR, len(nodes))

    return HealthResponse(
        status="healthy" if is_healthy else "degraded",
        version=settings.VERSION,
        total_nodes=len(nodes),
        online_nodes=len(online_nodes),
        replication_factor=settings.DEFAULT_REPLICATION_FACTOR,
        storage_accessible=len(online_nodes) > 0,
    )
