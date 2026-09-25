import shutil
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.failure_detector import failure_detector
from app.core.metadata import metadata_manager
from app.main import app
from app.storage.storage_manager import storage_manager


@pytest.fixture(scope="function")
def temp_storage():
    """Provides a temporary isolated multi-node storage and metadata environment for each test."""
    temp_dir = tempfile.mkdtemp(prefix="vault_test_cluster_")
    original_base = settings.BASE_STORAGE_PATH
    temp_path = Path(temp_dir)
    settings.BASE_STORAGE_PATH = temp_path

    # Reset and initialize all simulated nodes and metadata DB in the temporary directory
    storage_manager.reset(base_path=temp_path)
    storage_manager.initialize_all()
    metadata_manager.reset(db_path=temp_path / "metadata.db")
    failure_detector.reset()

    yield storage_manager

    # Teardown: restore original path and delete temporary directory
    settings.BASE_STORAGE_PATH = original_base
    storage_manager.reset(base_path=original_base)
    metadata_manager.reset(db_path=original_base / "metadata.db")
    failure_detector.reset()
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture(scope="function")
def client(temp_storage):
    """Provides a TestClient wired to the temporary multi-node storage cluster."""
    with TestClient(app) as test_client:
        yield test_client
