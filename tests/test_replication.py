from fastapi.testclient import TestClient
from app.config import settings
from app.storage.storage_manager import storage_manager


def test_cluster_node_listing(client: TestClient):
    """Test listing of all 5 storage nodes in the cluster."""
    response = client.get("/nodes")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 5
    assert data["online_count"] == 5
    node_names = [n["node_name"] for n in data["nodes"]]
    for expected in ["node1", "node2", "node3", "node4", "node5"]:
        assert expected in node_names


def test_replicated_upload_physical_verification(client: TestClient):
    """Verify that uploading an object physically writes replicas to configured nodes."""
    object_name = "replicated_file.txt"
    payload = b"Distributed data replication in Vault!"

    # 1. Upload with default replication factor (3)
    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    data = put_res.json()
    assert data["replication_factor"] == 3
    replicas = data["replicas"]
    assert len(replicas) == 3

    # 2. Verify physical presence on disk for each replica node
    for node_name in replicas:
        node = storage_manager.get_node(node_name)
        assert node.object_exists(object_name)
        assert node.read_object_bytes(object_name) == payload

    # 3. Verify non-replica nodes do NOT contain the object
    non_replicas = set(settings.STORAGE_NODES) - set(replicas)
    for node_name in non_replicas:
        node = storage_manager.get_node(node_name)
        assert not node.object_exists(object_name)


def test_configurable_replication_factor(client: TestClient):
    """Test setting custom replication factor (e.g. 5 vs 1)."""
    # Replication factor = 5
    res5 = client.put("/objects/full_copy.bin?replication_factor=5", content=b"all_nodes")
    assert res5.status_code == 201
    assert res5.json()["replication_factor"] == 5
    assert len(res5.json()["replicas"]) == 5

    # Replication factor = 1
    res1 = client.put("/objects/single_copy.bin?replication_factor=1", content=b"single_node")
    assert res1.status_code == 201
    assert res1.json()["replication_factor"] == 1
    assert len(res1.json()["replicas"]) == 1


def test_read_failover_when_replica_node_offline(client: TestClient):
    """Verify that if one replica node goes offline, reads seamlessly fail over to another replica."""
    object_name = "failover_doc.txt"
    payload = b"Reliable content during node failure"

    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]
    first_replica = replicas[0]
    second_replica = replicas[1]

    # Read initially succeeds
    get_res1 = client.get(f"/objects/{object_name}")
    assert get_res1.status_code == 200
    assert get_res1.content == payload

    # Simulate first replica node going offline
    offline_res = client.post(f"/nodes/{first_replica}/offline")
    assert offline_res.status_code == 200
    assert offline_res.json()["is_online"] is False

    # Download must STILL succeed by automatically reading from an alternate replica!
    get_res2 = client.get(f"/objects/{object_name}")
    assert get_res2.status_code == 200
    assert get_res2.content == payload
    # Verify it was served by a remaining online node
    assert get_res2.headers["x-vault-served-by"] != first_replica


def test_delete_removes_all_replicas(client: TestClient):
    """Verify deletion removes the object from all physical replica nodes."""
    object_name = "to_be_purged.dat"
    payload = b"Ephemeral data"

    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]

    # Delete object
    del_res = client.delete(f"/objects/{object_name}")
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert set(del_data["deleted_from_nodes"]) == set(replicas)

    # Check physical disk on all nodes
    for node_name in settings.STORAGE_NODES:
        node = storage_manager.get_node(node_name)
        assert not node.object_exists(object_name)


def test_metadata_contains_replica_locations(client: TestClient):
    """Verify metadata endpoint returns replica nodes and replication factor."""
    object_name = "meta_test.json"
    client.put(f"/objects/{object_name}", content=b'{"distributed": true}')

    meta_res = client.get(f"/objects/{object_name}/metadata")
    assert meta_res.status_code == 200
    meta = meta_res.json()
    assert len(meta["replicas"]) == 3
    assert meta["replication_factor"] == 3


def test_node_offline_and_online_api(client: TestClient):
    """Test administrative toggle of node online/offline states."""
    # Take node3 offline
    off_res = client.post("/nodes/node3/offline")
    assert off_res.status_code == 200
    assert off_res.json()["is_online"] is False

    # Check /nodes list
    nodes_res = client.get("/nodes")
    assert nodes_res.json()["online_count"] == 4

    # Bring node3 back online
    on_res = client.post("/nodes/node3/online")
    assert on_res.status_code == 200
    assert on_res.json()["is_online"] is True

    nodes_res2 = client.get("/nodes")
    assert nodes_res2.json()["online_count"] == 5
