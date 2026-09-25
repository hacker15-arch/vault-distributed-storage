import pytest
from app.core.metadata import metadata_manager
from app.core.rebalance import rebalance_manager
from app.storage.storage_manager import storage_manager


def test_cluster_utilization_analysis(client):
    """Verify that cluster storage utilization analysis reports stored bytes and object counts per node."""
    # Seed objects
    client.put("/objects/util_file_1.txt", content=b"Utilization test payload 1")
    client.put("/objects/util_file_2.txt", content=b"Utilization test payload 2")

    res = client.get("/admin/rebalance/status")
    assert res.status_code == 200
    data = res.json()
    assert data["total_nodes"] == 5
    assert data["online_nodes"] == 5
    assert data["in_progress"] is False
    assert len(data["utilization"]) == 5

    # Each online node with replicas reports positive bytes_used and object_count
    for util in data["utilization"]:
        assert util["bytes_used"] >= 0
        assert util["object_count"] >= 0


def test_balanced_cluster_skips_unnecessary_migrations(client):
    """Verify that rebalancing an evenly distributed cluster does not perform unnecessary object moves."""
    # Seed objects normally
    client.put("/objects/even_1.txt", content=b"Data 1")
    client.put("/objects/even_2.txt", content=b"Data 2")

    res = client.post("/admin/rebalance")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "balanced"
    assert data["objects_moved"] == 0
    assert data["bytes_transferred"] == 0
    assert data["imbalance_detected"] is False


def test_rebalance_imbalanced_cluster(client):
    """Verify that rebalancing detects an overloaded node and migrates replicas to underloaded nodes."""
    object_name = "imbalanced_heavy_doc.txt"
    payload = b"Heavy payload for rebalancing test " * 100  # 3500 bytes

    # 1. Manually seed heavy file onto node1 only
    node1 = storage_manager.get_node("node1")
    node1.write_object(object_name, payload, version=1, checksum="hash123")

    # Record in metadata catalog as located only on node1
    metadata_manager.record_object_write(
        object_name=object_name,
        size=len(payload),
        checksum="hash123",
        replication_factor=1,
        replicas=["node1"],
    )

    # Node1 is now heavily loaded compared to other empty nodes
    util_before = rebalance_manager.analyze_cluster_utilization()
    node1_before = next(u for u in util_before if u.node_name == "node1")
    assert node1_before.bytes_used >= len(payload)

    # 2. Trigger on-demand rebalance via POST /admin/rebalance
    rebal_res = client.post("/admin/rebalance")
    assert rebal_res.status_code == 200
    data = rebal_res.json()

    # Rebalance must detect imbalance and migrate object away from node1 to an underloaded node
    assert data["imbalance_detected"] is True
    assert data["objects_moved"] >= 1
    assert data["bytes_transferred"] >= len(payload)
    assert data["status"] == "rebalanced"

    # Verify action details
    action = data["actions"][0]
    assert action["object_name"] == object_name
    assert action["source_node"] == "node1"
    target_node_name = action["target_node"]
    assert target_node_name != "node1"
    assert action["status"] == "success"

    # Verify physical file now exists on target_node and is removed from node1
    target_node = storage_manager.get_node(target_node_name)
    assert target_node.read_object_bytes(object_name) == payload
    assert not (node1.root_path / object_name).is_file()

    # Verify metadata catalog updated replica locations
    meta_after = metadata_manager.get_object(object_name)
    assert target_node_name in meta_after["replicas"]
    assert "node1" not in meta_after["replicas"]


def test_rebalance_concurrency_guard(client):
    """Verify that concurrent rebalance runs are blocked while a rebalance is in progress."""
    rebalance_manager._is_rebalancing = True

    try:
        res = client.post("/admin/rebalance")
        assert res.status_code == 200
        assert res.json()["status"] == "in_progress"
        assert res.json()["objects_moved"] == 0
    finally:
        rebalance_manager._is_rebalancing = False
