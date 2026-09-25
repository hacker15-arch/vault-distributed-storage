import pytest
from app.config import settings
from app.core.metadata import metadata_manager
from app.storage.storage_manager import storage_manager


def test_quorum_math_validation_endpoint(client):
    """Verify the quorum math validation API endpoint."""
    res = client.get("/admin/quorum/validate?write_quorum=2&read_quorum=2&replication_factor=3")
    assert res.status_code == 200
    data = res.json()
    assert data["write_quorum"] == 2
    assert data["read_quorum"] == 2
    assert data["replication_factor"] == 3
    assert data["strong_consistency"] is True
    assert data["overlap_nodes"] == 1


def test_quorum_math_eventual_consistency_warning(client):
    """Verify that W + R <= N returns strong_consistency = False."""
    res = client.get("/admin/quorum/validate?write_quorum=1&read_quorum=1&replication_factor=3")
    assert res.status_code == 200
    data = res.json()
    assert data["strong_consistency"] is False


def test_write_quorum_satisfied(client):
    """Verify that writes succeed and return quorum headers when write quorum is met."""
    res = client.put(
        "/objects/quorum_test.txt",
        content=b"Quorum test payload",
        headers={"X-Vault-Write-Quorum": "2", "X-Vault-Replication-Factor": "3"},
    )
    assert res.status_code == 201
    assert "x-vault-write-quorum-achieved" in res.headers
    assert res.headers["x-vault-write-quorum-achieved"] == "3/2"


def test_write_quorum_failure_when_nodes_offline(client):
    """Verify that upload returns 503 when required write quorum cannot be achieved due to offline nodes."""
    # Take 4 out of 5 nodes offline so only 1 node remains online
    for node_name in ["node2", "node3", "node4", "node5"]:
        client.post(f"/nodes/{node_name}/offline")

    res = client.put(
        "/objects/quorum_fail.txt",
        content=b"Should fail write quorum",
        params={"write_quorum": 2, "replication_factor": 3},
    )
    assert res.status_code == 503
    assert "Write quorum failed" in res.json()["detail"]


def test_read_quorum_satisfied(client):
    """Verify that reads succeed and return quorum headers when read quorum is met."""
    client.put("/objects/read_q.txt", content=b"Read quorum data")

    res = client.get("/objects/read_q.txt", params={"read_quorum": 2})
    assert res.status_code == 200
    assert res.content == b"Read quorum data"
    assert "x-vault-read-quorum-achieved" in res.headers


def test_read_quorum_failure_when_nodes_offline(client):
    """Verify that GET returns 503 Service Unavailable when read quorum cannot be satisfied."""
    client.put("/objects/read_fail.txt", content=b"Read quorum test content")

    # Put 4 nodes offline
    for node_name in ["node2", "node3", "node4", "node5"]:
        client.post(f"/nodes/{node_name}/offline")

    res = client.get("/objects/read_fail.txt", params={"read_quorum": 2})
    assert res.status_code == 503
    assert "Read quorum failed" in res.json()["detail"]


def test_read_repair_on_stale_replica(client):
    """Verify that reading an object with a stale replica triggers inline read-repair to latest version."""
    object_name = "stale_repair_doc.txt"

    # 1. Upload initial version 1 (written to nodes)
    client.put(f"/objects/{object_name}", content=b"Version 1 Content")

    meta_v1 = metadata_manager.get_object(object_name)
    replicas_v1 = meta_v1["replicas"]
    stale_target_node = replicas_v1[0]

    # 2. Take stale_target_node offline temporarily
    client.post(f"/nodes/{stale_target_node}/offline")

    # 3. Upload version 2 while target node is offline
    client.put(f"/objects/{object_name}", content=b"Version 2 Updated Content")

    # 4. Bring target node back online (it now holds stale v1 or is missing v2)
    client.post(f"/nodes/{stale_target_node}/online")

    node_obj = storage_manager.get_node(stale_target_node)
    assert node_obj.get_local_version(object_name) < 2

    # 5. Read object with read_quorum=2. This must detect version divergence and trigger inline read-repair!
    read_res = client.get(f"/objects/{object_name}", params={"read_quorum": 2})
    assert read_res.status_code == 200
    assert read_res.content == b"Version 2 Updated Content"

    # 6. Verify target node has been inline-repaired to version 2!
    assert node_obj.get_local_version(object_name) == 2
    assert node_obj.read_object_bytes(object_name) == b"Version 2 Updated Content"
