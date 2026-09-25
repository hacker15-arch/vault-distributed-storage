import hashlib
import logging
import mimetypes
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from app.config import settings
from app.core.metadata import MetadataManager, metadata_manager
from app.models.schemas import ObjectHistoryResponse, ObjectMetadata, ObjectVersionInfo
from app.storage.node import NodeOfflineError, StorageNode
from app.storage.storage_manager import StorageManager, storage_manager

logger = logging.getLogger("vault.replication")


class ReplicationManager:
    """Manages object replication, versioning, replica placement, and retrieval."""

    def __init__(
        self,
        manager: Optional[StorageManager] = None,
        meta_manager: Optional[MetadataManager] = None,
    ):
        self.storage_manager = manager or storage_manager
        self.metadata_manager = meta_manager or metadata_manager

    def select_nodes_for_object(self, object_name: str, count: int) -> List[StorageNode]:
        """Select target nodes using Rendezvous (Highest Random Weight) Hashing."""
        online_nodes = self.storage_manager.get_online_nodes()
        if not online_nodes:
            raise RuntimeError("No storage nodes are currently online")

        scored_nodes = []
        for node in online_nodes:
            h = hashlib.sha256(f"{object_name}:{node.node_name}".encode("utf-8")).hexdigest()
            scored_nodes.append((h, node))

        # Higher hash score = higher priority for this object
        scored_nodes.sort(key=lambda item: item[0], reverse=True)

        target_count = min(count, len(online_nodes))
        return [node for _, node in scored_nodes[:target_count]]

    def replicate_write(
        self,
        object_name: str,
        data: bytes,
        replication_factor: Optional[int] = None,
        write_quorum: Optional[int] = None,
        content_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Write an object and its version to multiple storage nodes and record in metadata catalog."""
        rf = replication_factor or settings.DEFAULT_REPLICATION_FACTOR
        wq = write_quorum if write_quorum is not None else min(settings.DEFAULT_WRITE_QUORUM, rf)

        # Enforce split-brain write fencing if any node is network partitioned
        all_nodes = self.storage_manager.list_nodes()
        if any(n.is_partitioned for n in all_nodes):
            from app.core.partition import partition_manager
            connected = [n.node_name for n in all_nodes if n.is_online and not n.is_partitioned]
            partition_manager.verify_split_brain_fencing(connected)

        target_nodes = self.select_nodes_for_object(object_name, rf)

        if not target_nodes:
            raise RuntimeError(f"Cannot write object '{object_name}': no online nodes available")

        # 1. Determine next version
        existing_meta = self.metadata_manager.get_object(object_name)
        next_version = (existing_meta["current_version"] + 1) if existing_meta else 1

        # 2. Compute SHA-256 checksum
        checksum = hashlib.sha256(data).hexdigest()

        # Guess content type if not provided
        if not content_type:
            guessed, _ = mimetypes.guess_type(object_name)
            content_type = guessed or "application/octet-stream"

        successful_nodes: List[str] = []
        errors = []

        # 3. Write data, version archive, and sidecar to replica nodes
        for node in target_nodes:
            try:
                node.write_object(
                    object_name,
                    data,
                    version=next_version,
                    checksum=checksum,
                )
                successful_nodes.append(node.node_name)
                logger.info(
                    "Replica created: %s (v%d) on %s",
                    object_name,
                    next_version,
                    node.node_name,
                )
            except Exception as e:
                logger.error("Failed to write replica on %s: %s", node.node_name, str(e))
                errors.append((node.node_name, str(e)))

        # Enforce write quorum
        from app.core.consistency import consistency_manager
        consistency_manager.verify_write_quorum(successful_nodes, wq)

        # 4. Commit metadata and version record in SQLite
        record = self.metadata_manager.record_object_write(
            object_name=object_name,
            size=len(data),
            checksum=checksum,
            replication_factor=rf,
            replicas=successful_nodes,
            content_type=content_type,
        )

        record["write_quorum_achieved"] = f"{len(successful_nodes)}/{wq}"

        logger.info(
            "Object '%s' v%d committed to metadata catalog with %d replicas (Write Quorum %s): %s",
            object_name,
            next_version,
            len(successful_nodes),
            record["write_quorum_achieved"],
            successful_nodes,
        )
        return record

    def read_object_bytes(
        self,
        object_name: str,
        version: Optional[int] = None,
        read_quorum: Optional[int] = None,
    ) -> Tuple[str, bytes, str]:
        """Read object (latest or specific version) enforcing read quorum and inline read repair."""
        from app.core.consistency import consistency_manager
        rq = read_quorum if read_quorum is not None else settings.DEFAULT_READ_QUORUM
        donor_node, latest_ver, healthy_count, rq = consistency_manager.inspect_and_read_repair(
            object_name, version=version, read_quorum=rq
        )
        data = donor_node.read_object_bytes(object_name, version=latest_ver)
        quorum_achieved = f"{healthy_count}/{rq}"
        return donor_node.node_name, data, quorum_achieved

    async def read_object_chunks(
        self,
        object_name: str,
        version: Optional[int] = None,
        read_quorum: Optional[int] = None,
        chunk_size: int = 64 * 1024,
    ) -> Tuple[str, AsyncGenerator[bytes, None], str]:
        """Stream object (latest or specific version) enforcing read quorum and inline read repair."""
        from app.core.consistency import consistency_manager
        rq = read_quorum if read_quorum is not None else settings.DEFAULT_READ_QUORUM
        donor_node, latest_ver, healthy_count, rq = consistency_manager.inspect_and_read_repair(
            object_name, version=version, read_quorum=rq
        )
        stream = donor_node.read_object_chunks(
            object_name, version=latest_ver, chunk_size=chunk_size
        )
        quorum_achieved = f"{healthy_count}/{rq}"
        return donor_node.node_name, stream, quorum_achieved

    def delete_replicas(self, object_name: str) -> List[str]:
        """Delete an object, its versions, and metadata from all nodes and the catalog."""
        deleted_from = []
        for node in self.storage_manager.list_nodes():
            try:
                if node.is_online and node.delete_object(object_name):
                    deleted_from.append(node.node_name)
                    logger.info("Deleted '%s' from %s", object_name, node.node_name)
            except Exception as e:
                logger.warning("Error deleting replica on %s: %s", node.node_name, str(e))

        # Remove from metadata catalog
        self.metadata_manager.delete_object(object_name)
        return deleted_from

    def get_object_metadata(self, object_name: str) -> Optional[ObjectMetadata]:
        """Retrieve aggregated object metadata from SQLite catalog."""
        meta = self.metadata_manager.get_object(object_name)
        if not meta:
            return None

        # Confirm which replicas are actually currently reachable
        live_replicas = []
        for node_name in meta["replicas"]:
            try:
                node = self.storage_manager.get_node(node_name)
                if node.is_online and node.object_exists(object_name):
                    live_replicas.append(node_name)
            except Exception:
                continue

        return ObjectMetadata(
            object_id=meta["object_id"],
            object_name=meta["object_name"],
            version=meta["current_version"],
            size=meta["size"],
            checksum=meta["checksum"],
            content_type=meta.get("content_type") or "application/octet-stream",
            created_at=datetime.fromisoformat(meta["created_at"]),
            modified_at=datetime.fromisoformat(meta["updated_at"]),
            replicas=live_replicas or meta["replicas"],
            replication_factor=meta["replication_factor"],
        )

    def get_object_history(self, object_name: str) -> Optional[ObjectHistoryResponse]:
        """Retrieve full version history for an object."""
        meta = self.metadata_manager.get_object(object_name)
        if not meta:
            return None

        ver_rows = self.metadata_manager.get_object_versions(object_name)
        versions = [
            ObjectVersionInfo(
                version=v["version"],
                size=v["size"],
                checksum=v["checksum"],
                replicas=v["replicas"],
                created_at=v["created_at"],
            )
            for v in ver_rows
        ]

        return ObjectHistoryResponse(
            object_name=object_name,
            current_version=meta["current_version"],
            versions=versions,
        )

    def list_all_objects(self) -> List[ObjectMetadata]:
        """List all current objects recorded in the metadata catalog."""
        rows = self.metadata_manager.list_objects()
        result = []
        for r in rows:
            result.append(
                ObjectMetadata(
                    object_id=r["object_id"],
                    object_name=r["object_name"],
                    version=r["current_version"],
                    size=r["size"],
                    checksum=r["checksum"],
                    content_type=r.get("content_type") or "application/octet-stream",
                    created_at=datetime.fromisoformat(r["created_at"]),
                    modified_at=datetime.fromisoformat(r["updated_at"]),
                    replicas=r["replicas"],
                    replication_factor=r["replication_factor"],
                )
            )
        return result


replication_manager = ReplicationManager()
