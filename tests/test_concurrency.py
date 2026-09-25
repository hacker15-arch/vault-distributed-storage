import asyncio
import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient

from app.main import app
from app.core.lock_manager import lock_manager


@pytest.mark.asyncio
async def test_concurrent_writes_are_serialized_and_versioned(temp_storage):
    """Verify that multiple concurrent writes to the same key are safely serialized into successive versions."""
    object_name = "concurrent_updates.txt"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Launch 5 concurrent upload requests to the exact same object name
        tasks = [
            client.put(f"/objects/{object_name}", content=f"Payload revision {i}".encode())
            for i in range(1, 6)
        ]
        responses = await asyncio.gather(*tasks)

        # Every write must succeed
        for res in responses:
            assert res.status_code == 201

        # The versions generated must be distinct integers from 1 to 5
        versions = [r.json()["version"] for r in responses]
        assert sorted(versions) == [1, 2, 3, 4, 5]

        # Final metadata reflects current version 5
        meta_res = await client.get(f"/objects/{object_name}/metadata")
        assert meta_res.status_code == 200
        assert meta_res.json()["version"] == 5


@pytest.mark.asyncio
async def test_concurrent_reads_do_not_block_each_other(temp_storage):
    """Verify that multiple simultaneous downloads execute concurrently using shared read locks."""
    object_name = "shared_read_doc.txt"
    content = b"Shared concurrent read content across multiple clients"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Pre-seed the object
        await client.put(f"/objects/{object_name}", content=content)

        # Launch 10 simultaneous downloads
        tasks = [client.get(f"/objects/{object_name}") for _ in range(10)]
        responses = await asyncio.gather(*tasks)

        # All 10 reads succeed simultaneously
        for res in responses:
            assert res.status_code == 200
            assert res.content == content


@pytest.mark.asyncio
async def test_concurrent_writes_to_different_keys_parallel(temp_storage):
    """Verify that concurrent writes to different object keys do not lock each other out."""
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Launch 5 writes to 5 different objects
        tasks = [
            client.put(f"/objects/file_{i}.txt", content=f"Independent file {i}".encode())
            for i in range(1, 6)
        ]
        responses = await asyncio.gather(*tasks)

        for i, res in enumerate(responses, start=1):
            assert res.status_code == 201
            assert res.json()["object_name"] == f"file_{i}.txt"
            assert res.json()["version"] == 1


@pytest.mark.asyncio
async def test_lock_manager_lifecycle_cleanup(temp_storage):
    """Verify that when operations finish, lock memory is automatically reclaimed."""
    key = "ephemeral_lock_target.dat"

    # Acquire and release read lock
    async with lock_manager.read_lock(key):
        pass

    # Lock must be cleaned up from memory
    assert lock_manager.active_lock_count() == 0

    # Acquire and release write lock
    async with lock_manager.write_lock(key):
        pass

    assert lock_manager.active_lock_count() == 0


@pytest.mark.asyncio
async def test_simultaneous_write_and_delete_safety(temp_storage):
    """Verify that concurrent write and delete operations on the same object are safely serialized."""
    object_name = "race_target.txt"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Pre-seed
        await client.put(f"/objects/{object_name}", content=b"Initial")

        # Simultaneously trigger a write and a delete
        t_write = client.put(f"/objects/{object_name}", content=b"Updated version")
        t_del = client.delete(f"/objects/{object_name}")

        responses = await asyncio.gather(t_write, t_del, return_exceptions=True)

        # Neither operation crashes; one executes before the other cleanly
        for res in responses:
            assert not isinstance(res, Exception)
            assert res.status_code in (200, 201, 404)

