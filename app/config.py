import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration settings for Vault Object Storage."""

    PROJECT_NAME: str = "Vault Distributed Object Storage"
    VERSION: str = "0.5.0"
    DEBUG: bool = False

    # Base directory for simulated storage nodes and metadata
    # On Vercel serverless runtime, default to ephemeral /tmp directory
    BASE_STORAGE_PATH: Path = Path("/tmp/storage") if os.getenv("VERCEL") else Path("storage")

    # List of simulated node identifiers
    STORAGE_NODES: list[str] = ["node1", "node2", "node3", "node4", "node5"]
    PRIMARY_NODE_NAME: str = "node1"

    # Default replication factor and quorum settings
    DEFAULT_REPLICATION_FACTOR: int = 3
    DEFAULT_WRITE_QUORUM: int = 2
    DEFAULT_READ_QUORUM: int = 1

    # Streaming and buffer chunk size (64KB default)
    CHUNK_SIZE: int = 64 * 1024

    # Failure detection settings
    HEALTH_PROBE_TIMEOUT_SECONDS: float = 2.0
    SLOW_NODE_THRESHOLD_MS: float = 100.0
    MAX_CONSECUTIVE_FAILURES: int = 3

    # Server binding defaults
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = SettingsConfigDict(env_prefix="VAULT_", env_file=".env", extra="ignore")

    def get_node_path(self, node_name: str) -> Path:
        """Returns the filesystem path for a specific simulated node."""
        return self.BASE_STORAGE_PATH / node_name

    @property
    def node_storage_path(self) -> Path:
        """Returns the primary node's storage path (for backward compatibility)."""
        return self.get_node_path(self.PRIMARY_NODE_NAME)

    @property
    def metadata_db_path(self) -> Path:
        """Returns the path to the SQLite metadata database."""
        return self.BASE_STORAGE_PATH / "metadata.db"


settings = Settings()
