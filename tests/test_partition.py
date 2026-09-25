import pytest
from app.storage.storage_manager import storage_manager


def test_partition_node_isolation_and_preservation(client):
    """Verify isolating a node sets status to 'partitioned' while preserving data on disk."""
    # Seed data
    client.put("/objects/partition_file.txt", content=b"Data before partition")

    # Partition node1
    part_res = client.post("/admin/nodes/node1/partition")
    assert part_res.status_code == 200
    assert part_res.json()["status"] == "partitioned"
    assert part_res.json()["is_partitioned"] is True

    # Data is physically preserved on disk
    node1 = storage_manager.get_node("node1")
    assert node1.root_path.exists()
    assert (node1.root_path / "partition_file.txt").is_file()

    # Heal node1
    unpart_res = client.post("/admin/nodes/node1/unpartition")
    assert unpart_res.status_code == 200
    assert unpart_res.json()["status"] == "healthy"


def test_split_brain_status_endpoint(client):
    """Verify the partition status API endpoint returns majority status and fencing state."""
    res = client.get("/admin/partition/status")
    assert res.status_code == 200
    data = res.json()
    assert data["total_nodes"] == 5
    assert data["majority_threshold"] == 3
    assert data["has_majority"] is True
    assert data["fenced"] is False


def test_split_brain_write_fencing_blocks_minority_writes(client):
    """Verify that split-brain write fencing rejects writes when connected nodes are a minority."""
    # Partition 4 of 5 nodes into Group A (Isolated)
    client.post(
        "/admin/partition/simulate",
        json={
            "partition_a": ["node1", "node2", "node3", "node4"],
            "partition_b": ["node5"],
        },
    )

    status_res = client.get("/admin/partition/status")
    assert status_res.json()["has_majority"] is False
    assert status_res.json()["fenced"] is True

    # Attempt write while in minority partition state
    write_res = client.put("/objects/split_brain_test.txt", content=b"Fenced write payload")
    assert write_res.status_code == 503
    assert "Split-brain write fencing active" in write_res.json()["detail"]

    # Clean up / heal cluster
    client.post("/admin/partition/heal")


def test_split_brain_majority_writes_succeed(client):
    """Verify that writes on a majority partition (3/5 nodes) succeed under split-brain guard."""
    # Divide cluster: 2 nodes isolated, 3 nodes connected (majority)
    client.post(
        "/admin/partition/simulate",
        json={
            "partition_a": ["node4", "node5"],
            "partition_b": ["node1", "node2", "node3"],
        },
    )

    status_res = client.get("/admin/partition/status")
    assert status_res.json()["has_majority"] is True

    # Write attempt on majority partition succeeds
    write_res = client.put("/objects/majority_write.txt", content=b"Majority write payload")
    assert write_res.status_code == 201
    assert write_res.json()["version"] == 1

    # Clean up
    client.post("/admin/partition/heal")


def test_partition_healing_and_automatic_resynchronization(client):
    """Verify that healing all partitions triggers automated cluster resynchronization."""
    # 1. Upload object
    client.put("/objects/resync_doc.txt", content=b"Original Version 1")

    # 2. Partition node3
    client.post("/admin/nodes/node3/partition")

    # 3. Upload Version 2 while node3 is partitioned
    client.put("/objects/resync_doc.txt", content=b"Updated Version 2")

    # 4. Heal partitions across cluster via POST /admin/partition/heal
    heal_res = client.post("/admin/partition/heal")
    assert heal_res.status_code == 200
    heal_data = heal_res.json()
    assert heal_data["status"] == "healed"
    assert "node3" in heal_data["healed_nodes"]
    assert heal_data["resync_report"]["total_scanned"] >= 1

    # 5. Verify node3 is automatically resynchronized and holds Version 2
    node3 = storage_manager.get_node("node3")
    assert node3.get_local_version("resync_doc.txt") == 2
    assert node3.read_object_bytes("resync_doc.txt") == b"Updated Version 2"
