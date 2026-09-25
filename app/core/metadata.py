import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger("vault.metadata")


class MetadataManager:
    """Manages object metadata and versioning history using SQLite."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.metadata_db_path

    def _get_connection(self) -> sqlite3.Connection:
        """Create a thread-safe connection to the SQLite database with WAL mode."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable Write-Ahead Logging for high-performance concurrent reads & writes
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def initialize(self) -> None:
        """Create database tables and indexes if they do not exist."""
        with self._get_connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS objects (
                    object_id TEXT PRIMARY KEY,
                    object_name TEXT UNIQUE NOT NULL,
                    current_version INTEGER NOT NULL DEFAULT 1,
                    size INTEGER NOT NULL,
                    checksum TEXT NOT NULL,
                    content_type TEXT DEFAULT 'application/octet-stream',
                    replication_factor INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS object_versions (
                    version_id TEXT PRIMARY KEY,
                    object_name TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    size INTEGER NOT NULL,
                    checksum TEXT NOT NULL,
                    replicas TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(object_name, version),
                    FOREIGN KEY (object_name) REFERENCES objects(object_name) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS replica_status (
                    object_name TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    node_name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'healthy',
                    last_verified_at TEXT NOT NULL,
                    PRIMARY KEY(object_name, version, node_name)
                );

                CREATE INDEX IF NOT EXISTS idx_versions_obj ON object_versions(object_name);
                CREATE INDEX IF NOT EXISTS idx_replicas_obj_ver ON replica_status(object_name, version);
                """
            )
        logger.info("Initialized metadata database at: %s", self.db_path)

    def get_object(self, object_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve current metadata for an object."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM objects WHERE object_name = ?", (object_name,)
            ).fetchone()
            if not row:
                return None

            obj_dict = dict(row)
            # Fetch replica nodes from current version record
            ver_row = conn.execute(
                "SELECT replicas FROM object_versions WHERE object_name = ? AND version = ?",
                (object_name, obj_dict["current_version"]),
            ).fetchone()
            obj_dict["replicas"] = json.loads(ver_row["replicas"]) if ver_row else []
            return obj_dict

    def get_object_version(self, object_name: str, version: int) -> Optional[Dict[str, Any]]:
        """Retrieve metadata for a specific historical version of an object."""
        with self._get_connection() as conn:
            ver_row = conn.execute(
                "SELECT * FROM object_versions WHERE object_name = ? AND version = ?",
                (object_name, version),
            ).fetchone()
            if not ver_row:
                return None

            v_dict = dict(ver_row)
            v_dict["replicas"] = json.loads(v_dict["replicas"])
            return v_dict

    def get_object_versions(self, object_name: str) -> List[Dict[str, Any]]:
        """Retrieve all historical versions for an object in descending version order."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM object_versions WHERE object_name = ? ORDER BY version DESC",
                (object_name,),
            ).fetchall()

            versions = []
            for r in rows:
                d = dict(r)
                d["replicas"] = json.loads(d["replicas"])
                versions.append(d)
            return versions

    def record_object_write(
        self,
        object_name: str,
        size: int,
        checksum: str,
        replication_factor: int,
        replicas: List[str],
        content_type: str = "application/octet-stream",
    ) -> Dict[str, Any]:
        """Record a new object or increment its version upon write."""
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            existing = conn.execute(
                "SELECT object_id, current_version, created_at FROM objects WHERE object_name = ?",
                (object_name,),
            ).fetchone()

            if existing:
                # Update existing object to new version
                new_version = existing["current_version"] + 1
                object_id = existing["object_id"]
                created_at = existing["created_at"]

                conn.execute(
                    """
                    UPDATE objects
                    SET current_version = ?, size = ?, checksum = ?,
                        replication_factor = ?, content_type = ?, updated_at = ?
                    WHERE object_name = ?
                    """,
                    (
                        new_version,
                        size,
                        checksum,
                        replication_factor,
                        content_type,
                        now,
                        object_name,
                    ),
                )
            else:
                # Create brand new object at version 1
                new_version = 1
                object_id = str(uuid.uuid4())
                created_at = now

                conn.execute(
                    """
                    INSERT INTO objects (
                        object_id, object_name, current_version, size, checksum,
                        content_type, replication_factor, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        object_id,
                        object_name,
                        new_version,
                        size,
                        checksum,
                        content_type,
                        replication_factor,
                        created_at,
                        now,
                    ),
                )

            # Insert version record
            version_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO object_versions (
                    version_id, object_name, version, size, checksum, replicas, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    version_id,
                    object_name,
                    new_version,
                    size,
                    checksum,
                    json.dumps(replicas),
                    now,
                ),
            )

            # Insert replica status entries
            for node_name in replicas:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO replica_status (
                        object_name, version, node_name, status, last_verified_at
                    ) VALUES (?, ?, ?, 'healthy', ?)
                    """,
                    (object_name, new_version, node_name, now),
                )

            conn.commit()

        return {
            "object_id": object_id,
            "object_name": object_name,
            "version": new_version,
            "size": size,
            "checksum": checksum,
            "content_type": content_type,
            "replication_factor": replication_factor,
            "replicas": replicas,
            "created_at": created_at,
            "updated_at": now,
        }

    def delete_object(self, object_name: str) -> bool:
        """Delete an object and all its version records from metadata."""
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM objects WHERE object_name = ?", (object_name,))
            conn.execute("DELETE FROM object_versions WHERE object_name = ?", (object_name,))
            conn.execute("DELETE FROM replica_status WHERE object_name = ?", (object_name,))
            conn.commit()
            return cur.rowcount > 0

    def update_replica_status(
        self, object_name: str, version: int, node_name: str, status: str
    ) -> None:
        """Update health status of a specific replica ('healthy', 'corrupted', 'missing', 'stale')."""
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO replica_status (
                    object_name, version, node_name, status, last_verified_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (object_name, version, node_name, status, now),
            )
            conn.commit()

    def get_replica_statuses(self, object_name: str, version: int) -> Dict[str, str]:
        """Get status dictionary for all replicas of an object version."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT node_name, status FROM replica_status WHERE object_name = ? AND version = ?",
                (object_name, version),
            ).fetchall()
            return {r["node_name"]: r["status"] for r in rows}

    def update_version_replicas(
        self, object_name: str, version: int, replicas: List[str]
    ) -> None:
        """Update replica node locations for a specific version in the catalog."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE object_versions SET replicas = ? WHERE object_name = ? AND version = ?",
                (json.dumps(replicas), object_name, version),
            )
            conn.commit()

    def list_objects(self) -> List[Dict[str, Any]]:
        """List all active objects and their latest version information."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM objects ORDER BY object_name ASC"
            ).fetchall()

            result = []
            for row in rows:
                obj = dict(row)
                ver_row = conn.execute(
                    "SELECT replicas FROM object_versions WHERE object_name = ? AND version = ?",
                    (obj["object_name"], obj["current_version"]),
                ).fetchone()
                obj["replicas"] = json.loads(ver_row["replicas"]) if ver_row else []
                obj["version"] = obj["current_version"]
                result.append(obj)
            return result

    def reset(self, db_path: Optional[Path] = None) -> None:
        """Switch database path and re-initialize (used during tests)."""
        self.db_path = db_path or settings.metadata_db_path
        self.initialize()


metadata_manager = MetadataManager()
