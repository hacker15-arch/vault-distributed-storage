import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Optional

from app.models.schemas import ObjectMetadata


import time


class NodeOfflineError(Exception):
    """Raised when an operation is attempted on an offline node."""
    pass


class NodePartitionedError(NodeOfflineError):
    """Raised when an operation is attempted on a network-partitioned node."""
    pass


class StorageNode:
    """Simulates an individual storage node backed by an isolated local directory.

    Each node is an independent storage server with its own file storage, version archive,
    and replica sidecar metadata. Supports simulating offline states, latency, and network partitions.
    """

    def __init__(self, node_name: str, root_path: Path):
        self.node_name = node_name
        self.root_path = root_path.resolve()
        self.is_online: bool = True
        self.is_partitioned: bool = False
        self.simulated_delay: float = 0.0

    def initialize(self) -> None:
        """Ensure the storage directory exists on disk."""
        self.root_path.mkdir(parents=True, exist_ok=True)
        (self.root_path / ".versions").mkdir(parents=True, exist_ok=True)
        (self.root_path / ".vmeta").mkdir(parents=True, exist_ok=True)

    def _check_online(self) -> None:
        """Verify the node is currently online, not partitioned, and simulate latency."""
        if not self.is_online:
            raise NodeOfflineError(f"Node '{self.node_name}' is currently offline/crashed")
        if self.is_partitioned:
            raise NodePartitionedError(f"Node '{self.node_name}' is network partitioned/unreachable")
        if self.simulated_delay > 0:
            time.sleep(self.simulated_delay)

    def _safe_resolve_path(self, object_name: str) -> Path:
        """Resolve object path and prevent directory traversal vulnerabilities."""
        resolved_path = (self.root_path / object_name).resolve()
        if not str(resolved_path).startswith(str(self.root_path)):
            raise ValueError(f"Path traversal detected for object: {object_name}")
        return resolved_path

    def _get_version_path(self, object_name: str, version: int) -> Path:
        """Get path for a specific archived version file."""
        ver_dir = (self.root_path / ".versions" / object_name).resolve()
        return ver_dir / f"v{version}"

    def _get_meta_path(self, object_name: str) -> Path:
        """Get path for replica sidecar metadata."""
        meta_dir = (self.root_path / ".vmeta" / Path(object_name).parent).resolve()
        meta_dir.mkdir(parents=True, exist_ok=True)
        return meta_dir / f"{Path(object_name).name}.meta.json"

    def object_exists(self, object_name: str, version: Optional[int] = None) -> bool:
        """Check whether an object (or specific version) exists in this node's storage."""
        self._check_online()
        path = self._safe_resolve_path(object_name)
        if version is not None:
            ver_path = self._get_version_path(object_name, version)
            cur_ver = self.get_local_version(object_name)
            if cur_ver == version:
                return path.is_file() and ver_path.is_file()
            return ver_path.is_file()
        return path.is_file()

    def get_local_version(self, object_name: str) -> Optional[int]:
        """Read this node's local version from its sidecar metadata."""
        self._check_online()
        meta_path = self._get_meta_path(object_name)
        if not meta_path.is_file():
            # Fallback: if file exists on disk without sidecar
            if self.object_exists(object_name):
                return 1
            return None
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("version", 1)
        except Exception:
            return 1

    def write_object(
        self, object_name: str, data: bytes, version: int = 1, checksum: str = ""
    ) -> int:
        """Write raw bytes to disk atomically, preserving version archive and sidecar metadata."""
        self._check_online()
        target_path = self._safe_resolve_path(object_name)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        # 1. Atomic write to current path
        temp_path = target_path.with_suffix(f".tmp_{os.getpid()}_{id(self)}")
        try:
            with open(temp_path, "wb") as f:
                f.write(data)
            temp_path.replace(target_path)
        except Exception:
            if temp_path.exists():
                temp_path.unlink()
            raise

        # 2. Archive this specific version
        ver_path = self._get_version_path(object_name, version)
        ver_path.parent.mkdir(parents=True, exist_ok=True)
        with open(ver_path, "wb") as f:
            f.write(data)

        # 3. Store node-level replica sidecar metadata
        meta_path = self._get_meta_path(object_name)
        sidecar_data = {
            "object_name": object_name,
            "version": version,
            "checksum": checksum,
            "size": len(data),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(sidecar_data, f)

        return len(data)

    def read_object_bytes(self, object_name: str, version: Optional[int] = None) -> bytes:
        """Read all bytes for an object (latest or specified version)."""
        self._check_online()
        if version is not None:
            cur_ver = self.get_local_version(object_name)
            if cur_ver == version:
                target_path = self._safe_resolve_path(object_name)
            else:
                target_path = self._get_version_path(object_name, version)
        else:
            target_path = self._safe_resolve_path(object_name)

        if not target_path.is_file():
            raise FileNotFoundError(
                f"Object '{object_name}' (version {version or 'latest'}) not found on {self.node_name}"
            )
        with open(target_path, "rb") as f:
            return f.read()

    async def read_object_chunks(
        self,
        object_name: str,
        version: Optional[int] = None,
        chunk_size: int = 64 * 1024,
    ) -> AsyncGenerator[bytes, None]:
        """Stream object chunks asynchronously for latest or specific version."""
        self._check_online()
        if version is not None:
            cur_ver = self.get_local_version(object_name)
            if cur_ver == version:
                target_path = self._safe_resolve_path(object_name)
            else:
                target_path = self._get_version_path(object_name, version)
        else:
            target_path = self._safe_resolve_path(object_name)

        if not target_path.is_file():
            raise FileNotFoundError(
                f"Object '{object_name}' (version {version or 'latest'}) not found on {self.node_name}"
            )

        with open(target_path, "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk

    def delete_object(self, object_name: str) -> bool:
        """Delete an object, its version archives, and its sidecar metadata from disk."""
        self._check_online()
        target_path = self._safe_resolve_path(object_name)
        deleted = False

        if target_path.is_file():
            target_path.unlink()
            deleted = True

        # Remove versions folder
        ver_dir = (self.root_path / ".versions" / object_name).resolve()
        if ver_dir.exists():
            shutil.rmtree(ver_dir, ignore_errors=True)
            deleted = True

        # Remove sidecar
        meta_path = self._get_meta_path(object_name)
        if meta_path.is_file():
            meta_path.unlink()
            deleted = True

        return deleted

    def corrupt_object(self, object_name: str, version: Optional[int] = None) -> bool:
        """Simulate physical disk corruption/bit-rot by mutating bytes of an object on disk."""
        self._check_online()
        if version is not None:
            target_path = self._get_version_path(object_name, version)
        else:
            target_path = self._safe_resolve_path(object_name)

        if not target_path.is_file():
            return False

        with open(target_path, "rb") as f:
            data = bytearray(f.read())

        if len(data) > 0:
            # Flip bits on the first byte
            data[0] ^= 0xFF
        else:
            data = bytearray(b"[CORRUPTED]")

        with open(target_path, "wb") as f:
            f.write(data)

        # If mutating active file, also mutate version archive if present
        if version is None:
            cur_ver = self.get_local_version(object_name)
            if cur_ver is not None:
                ver_p = self._get_version_path(object_name, cur_ver)
                if ver_p.is_file():
                    with open(ver_p, "wb") as f:
                        f.write(data)

        return True

    def get_object_metadata(self, object_name: str) -> Optional[ObjectMetadata]:
        """Retrieve physical metadata for a stored object."""
        self._check_online()
        target_path = self._safe_resolve_path(object_name)
        if not target_path.is_file():
            return None

        stat = target_path.stat()
        created_at = datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc)
        modified_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        version = self.get_local_version(object_name) or 1

        return ObjectMetadata(
            object_name=object_name,
            version=version,
            size=stat.st_size,
            created_at=created_at,
            modified_at=modified_at,
        )

    def list_objects(self) -> list[ObjectMetadata]:
        """List all active objects stored in this node."""
        self._check_online()
        if not self.root_path.exists():
            return []

        objects = []
        for file_path in self.root_path.glob("**/*"):
            # Exclude internal metadata directories and temp files
            if (
                file_path.is_file()
                and not file_path.name.startswith(".tmp_")
                and ".versions" not in file_path.parts
                and ".vmeta" not in file_path.parts
            ):
                rel_path = file_path.relative_to(self.root_path).as_posix()
                meta = self.get_object_metadata(rel_path)
                if meta:
                    objects.append(meta)
        return objects

    def get_storage_stats(self) -> dict:
        """Check filesystem health and free disk space."""
        is_accessible = self.is_online and self.root_path.exists() and os.access(self.root_path, os.W_OK)
        total, used, free = None, None, None
        if is_accessible:
            usage = shutil.disk_usage(self.root_path)
            total, used, free = usage.total, usage.used, usage.free

        return {
            "node_name": self.node_name,
            "path": str(self.root_path),
            "accessible": is_accessible,
            "is_online": self.is_online,
            "total_space_bytes": total,
            "free_space_bytes": free,
        }
