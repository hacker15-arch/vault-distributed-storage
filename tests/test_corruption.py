import hashlib
from fastapi.testclient import TestClient
from app.storage.storage_manager import storage_manager


def test_verify_healthy_object(client: TestClient):
    """Verify that a freshly uploaded object passes integrity check on all replicas."""
    object_name = "clean_data.bin"
    payload = b"Uncorrupted verified data"
    expected_sum = hashlib.sha256(payload).hexdigest()

    # Upload
    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201

    # Verify integrity
    ver_res = client.get(f"/objects/{object_name}/verify")
    assert ver_res.status_code == 200
    data = ver_res.json()
    assert data["object_name"] == object_name
    assert data["is_healthy"] is True
    assert data["expected_checksum"] == expected_sum
    assert data["total_replicas"] == 3
    assert data["healthy_count"] == 3
    assert data["corrupted_count"] == 0
    assert data["missing_count"] == 0

    for rep in data["replicas"]:
        assert rep["status"] == "healthy"
        assert rep["actual_checksum"] == expected_sum


def test_corrupt_replica_simulation_and_detection(client: TestClient):
    """Verify that corrupting a replica physically on disk is detected by /verify."""
    object_name = "tampered_file.txt"
    payload = b"Confidential banking record"
    expected_sum = hashlib.sha256(payload).hexdigest()

    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]
    corrupted_node = replicas[0]

    # Corrupt replica on first node via admin simulation API
    corrupt_res = client.post(f"/admin/nodes/{corrupted_node}/corrupt/{object_name}")
    assert corrupt_res.status_code == 200
    assert corrupt_res.json()["status"] == "corrupted"

    # Verify integrity endpoint catches the corruption
    ver_res = client.get(f"/objects/{object_name}/verify")
    assert ver_res.status_code == 200
    data = ver_res.json()
    assert data["is_healthy"] is False
    assert data["corrupted_count"] == 1
    assert data["healthy_count"] == 2

    # Find the corrupted replica detail
    rep_map = {r["node_name"]: r for r in data["replicas"]}
    bad_rep = rep_map[corrupted_node]
    assert bad_rep["status"] == "corrupted"
    assert bad_rep["actual_checksum"] != expected_sum
    assert "checksum mismatch" in bad_rep["error_message"].lower()


def test_read_failover_bypasses_corrupted_replica(client: TestClient):
    """Verify that download operations detect corrupted replicas on the fly and failover to healthy replicas."""
    object_name = "resilient_file.txt"
    payload = b"Original pristine file bytes"

    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]
    first_node = replicas[0]

    # Corrupt the primary replica node
    client.post(f"/admin/nodes/{first_node}/corrupt/{object_name}")

    # Read the object
    get_res = client.get(f"/objects/{object_name}")
    assert get_res.status_code == 200
    # Must receive the uncorrupted original bytes
    assert get_res.content == payload
    # Must NOT have been served by the corrupted node
    assert get_res.headers["x-vault-served-by"] != first_node


def test_missing_replica_detection(client: TestClient):
    """Verify that deleting a physical replica file on disk is detected as 'missing'."""
    object_name = "missing_rep_test.txt"
    payload = b"Testing missing file detection"

    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]
    target_node_name = replicas[1]

    # Physically delete the replica file from target node's disk
    node = storage_manager.get_node(target_node_name)
    file_path = node._safe_resolve_path(object_name)
    assert file_path.is_file()
    file_path.unlink()

    # Verify integrity
    ver_res = client.get(f"/objects/{object_name}/verify")
    assert ver_res.status_code == 200
    data = ver_res.json()
    assert data["is_healthy"] is False
    assert data["missing_count"] == 1

    rep_map = {r["node_name"]: r for r in data["replicas"]}
    assert rep_map[target_node_name]["status"] == "missing"


def test_cluster_scrub_endpoint(client: TestClient):
    """Verify cluster-wide integrity scrub scans all objects and reports anomalies."""
    # Upload clean object
    client.put("/objects/clean1.txt", content=b"clean1")
    # Upload object and corrupt it
    res = client.put("/objects/corrupt1.txt", content=b"corrupt1")
    corrupt_node = res.json()["replicas"][0]
    client.post(f"/admin/nodes/{corrupt_node}/corrupt/corrupt1.txt")

    # Run cluster scrub
    scrub_res = client.post("/admin/scrub")
    assert scrub_res.status_code == 200
    data = scrub_res.json()
    assert data["total_scanned"] >= 2
    assert data["corrupted_count"] >= 1
    assert data["healthy_count"] >= 1
