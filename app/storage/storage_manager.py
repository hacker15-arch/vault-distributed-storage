import logging
from typing import Dict, List, Optional
from pathlib import Path

from app.config import settings
from app.storage.node import StorageNode

logger = logging.getLogger("vault.storage_manager")


class StorageManager:
    """Manages the cluster of simulated storage nodes."""

    def __init__(self, node_names: Optional[List[str]] = None, base_path: Optional[Path] = None):
        self.base_path = base_path or settings.BASE_STORAGE_PATH
        self.node_names = node_names or settings.STORAGE_NODES
        self._nodes: Dict[str, StorageNode] = {}
        self._setup_nodes()

    def _setup_nodes(self) -> None:
        """Instantiate StorageNode instances for each configured node."""
        self._nodes.clear()
        for name in self.node_names:
            node_dir = self.base_path / name
            self._nodes[name] = StorageNode(node_name=name, root_path=node_dir)

    def initialize_all(self) -> None:
        """Create and initialize storage directories on disk for all nodes."""
        for name, node in self._nodes.items():
            node.initialize()
            logger.info("Storage node '%s' initialized at %s", name, node.root_path)

    def get_node(self, node_name: str) -> StorageNode:
        """Retrieve a specific storage node by name."""
        if node_name not in self._nodes:
            raise KeyError(f"Storage node '{node_name}' is not registered in the cluster")
        return self._nodes[node_name]

    def list_nodes(self) -> List[StorageNode]:
        """Return all registered storage nodes."""
        return list(self._nodes.values())

    def get_online_nodes(self) -> List[StorageNode]:
        """Return list of currently online storage nodes."""
        return [node for node in self._nodes.values() if node.is_online]

    def set_node_online_status(self, node_name: str, is_online: bool) -> StorageNode:
        """Toggle online/offline status of a storage node."""
        node = self.get_node(node_name)
        node.is_online = is_online
        logger.info("Node '%s' state updated to is_online=%s", node_name, is_online)
        return node

    def reset(self, node_names: Optional[List[str]] = None, base_path: Optional[Path] = None) -> None:
        """Reconfigure nodes (useful in tests when base path changes)."""
        self.base_path = base_path or settings.BASE_STORAGE_PATH
        self.node_names = node_names or settings.STORAGE_NODES
        self._setup_nodes()


storage_manager = StorageManager()
