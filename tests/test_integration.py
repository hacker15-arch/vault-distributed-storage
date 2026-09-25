import asyncio
import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient

from app.main import app
from app.storage.storage_manager import storage_manager


def test_end_to_end_lifecycle_upload_corrupt_repair_download(client: TestClient):
    """
    Complete end-to-end distributed lifecycle test:
    Upload -> Update Version -> Simulate Bit-Rot -> Integrity Verification -> Self-Healing Repair -> Read & Download.
    """
    object_name = "archive/project_data.bin"
    v1_payload = b"Initial Version 1 Payload"
    v2_payload = b"Updated Version 2 Payload with Critical Assets"

    # Step 1: Upload Version 1
    up1 = client.put(f"/objects/{object_name}", content=v1_payload)
    assert up1.status_code == 201
    assert up1.json()["version"] == 1
    v1_replicas = up1.json()["replicas"]

    # Step 2: Update to Version 2
    up2 = client.put(f"/objects/{object_name}", content=v2_payload)
    assert up2.status_code == 201
    assert up2.json()["version"] == 2
    v2_replicas = up2.json()["replicas"]

    # Step 3: Corrupt replica on first node holding Version 2
    target_corrupt_node = v2_replicas[0]
    corrupt_res = client.post(f"/admin/nodes/{target_corrupt_node}/corrupt/{object_name}")
    assert corrupt_res.status_code == 200

    # Step 4: Verify corrupt status reported in integrity check BEFORE GET
    verify1 = client.get(f"/objects/{object_name}/verify")
    assert verify1.status_code == 200
    assert verify1.json()["is_healthy"] is False
    assert verify1.json()["corrupted_count"] >= 1

    # Step 5: Trigger cluster self-healing repair
    repair_res = client.post("/admin/repair")
    assert repair_res.status_code == 200
    assert repair_res.json()["repaired_count"] >= 1

    # Step 6: Verify object is now 100% healthy across all replicas
    verify2 = client.get(f"/objects/{object_name}/verify")
    assert verify2.status_code == 200
    assert verify2.json()["is_healthy"] is True
    assert verify2.json()["corrupted_count"] == 0

    # Step 7: Download object — clean Version 2 served
    down_res = client.get(f"/objects/{object_name}")
    assert down_res.status_code == 200
    assert down_res.content == v2_payload

    # Physical verification on disk
    corrupt_node_obj = storage_manager.get_node(target_corrupt_node)
    assert corrupt_node_obj.read_object_bytes(object_name) == v2_payload


def test_end_to_end_partition_fencing_resync_rebalance(client: TestClient):
    """
    Complete resilience test:
    Split-Brain Partitioning -> Minority Write Fencing -> Majority Writes -> Partition Healing & Resync -> Rebalancing.
    """
    # Step 1: Pre-seed object
    client.put("/objects/cluster_doc.txt", content=b"Pre-partition data")

    # Step 2: Simulate split-brain partition dividing cluster: 2 isolated, 3 connected
    part_res = client.post(
        "/admin/partition/simulate",
        json={
            "partition_a": ["node4", "node5"],
            "partition_b": ["node1", "node2", "node3"],
        },
    )
    assert part_res.status_code == 200

    status1 = client.get("/admin/partition/status").json()
    assert status1["has_majority"] is True

    # Step 3: Write to majority partition succeeds
    maj_write = client.put("/objects/majority_write.txt", content=b"Written on majority segment")
    assert maj_write.status_code == 201

    # Step 4: Isolate 4 nodes so remaining connected nodes (1) are a minority
    client.post(
        "/admin/partition/simulate",
        json={
            "partition_a": ["node1", "node2", "node3", "node4"],
            "partition_b": ["node5"],
        },
    )

    status2 = client.get("/admin/partition/status").json()
    assert status2["fenced"] is True

    # Minority write is fenced and rejected with HTTP 503
    min_write = client.put("/objects/fenced_doc.txt", content=b"Fenced write payload")
    assert min_write.status_code == 503
    assert "Split-brain write fencing active" in min_write.json()["detail"]

    # Step 5: Heal partition & trigger resynchronization
    heal_res = client.post("/admin/partition/heal")
    assert heal_res.status_code == 200
    assert heal_res.json()["status"] == "healed"

    # Step 6: Rebalance cluster storage
    rebal_res = client.post("/admin/rebalance")
    assert rebal_res.status_code == 200
    assert rebal_res.json()["status"] in ("balanced", "rebalanced")


@pytest.mark.asyncio
async def test_high_concurrency_stress_load(temp_storage):
    """
    High-concurrency stress test launching simultaneous uploads, downloads, version queries,
    and integrity verifications under load.
    """
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Concurrent uploads to different keys
        upload_tasks = [
            client.put(f"/objects/stress_file_{i}.dat", content=f"Stress payload data {i}".encode())
            for i in range(1, 11)
        ]
        upload_responses = await asyncio.gather(*upload_tasks)
        for res in upload_responses:
            assert res.status_code == 201

        # 2. Concurrent downloads and metadata checks
        download_tasks = [
            client.get(f"/objects/stress_file_{i}.dat") for i in range(1, 11)
        ]
        meta_tasks = [
            client.get(f"/objects/stress_file_{i}.dat/metadata") for i in range(1, 11)
        ]
        verify_tasks = [
            client.get(f"/objects/stress_file_{i}.dat/verify") for i in range(1, 11)
        ]

        all_read_responses = await asyncio.gather(*(download_tasks + meta_tasks + verify_tasks))
        for res in all_read_responses:
            assert res.status_code == 200
