import hashlib
from fastapi.testclient import TestClient
from app.core.repair import repair_manager
from app.storage.storage_manager import storage_manager


def test_repair_corrupted_replica_in_place(client: TestClient):
    """Verify that a corrupted replica is repaired in-place by copying from a healthy replica."""
    object_name = "auto_heal_doc.txt"
    payload = b"Important records that must not be lost."
    expected_sum = hashlib.sha256(payload).hexdigest()

    # 1. Upload object
    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]
    corrupted_node_name = replicas[0]

    # 2. Corrupt one replica
    client.post(f"/admin/nodes/{corrupted_node_name}/corrupt/{object_name}")
    ver_pre = client.get(f"/objects/{object_name}/verify").json()
    assert ver_pre["is_healthy"] is False
    assert ver_pre["corrupted_count"] == 1

    # 3. Trigger repair
    repair_res = client.post(f"/admin/repair/{object_name}")
    assert repair_res.status_code == 200
    data = repair_res.json()
    assert data["status"] == "repaired"
    assert data["final_healthy_count"] == 3
    assert len(data["actions"]) >= 1
    assert data["actions"][0]["action_type"] == "repaired_corrupted_in_place"
    assert data["actions"][0]["target_node"] == corrupted_node_name
    assert data["actions"][0]["status"] == "success"

    # 4. Verify physical disk on the repaired node has correct data and checksum
    repaired_node = storage_manager.get_node(corrupted_node_name)
    assert repaired_node.read_object_bytes(object_name) == payload
    assert hashlib.sha256(repaired_node.read_object_bytes(object_name)).hexdigest() == expected_sum

    # 5. Verify integrity scan now reports 100% healthy
    ver_post = client.get(f"/objects/{object_name}/verify").json()
    assert ver_post["is_healthy"] is True
    assert ver_post["corrupted_count"] == 0
    assert ver_post["healthy_count"] == 3


def test_repair_failed_node_replicates_to_spare_node(client: TestClient):
    """Verify that when a replica node fails, repair allocates and copies to a new spare node."""
    object_name = "fail_replace.dat"
    payload = b"High availability data requiring 3 copies"

    # 1. Upload
    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    initial_replicas = put_res.json()["replicas"]
    failed_node_name = initial_replicas[0]

    # 2. Take one replica node permanently offline
    client.post(f"/nodes/{failed_node_name}/offline")

    # 3. Trigger repair
    repair_res = client.post(f"/admin/repair/{object_name}")
    assert repair_res.status_code == 200
    data = repair_res.json()
    assert data["status"] == "repaired"
    assert data["final_healthy_count"] == 3

    # Check replacement action
    replacement_actions = [a for a in data["actions"] if a["action_type"] == "replicated_to_new_node"]
    assert len(replacement_actions) == 1
    new_node_name = replacement_actions[0]["target_node"]
    assert new_node_name != failed_node_name
    assert new_node_name not in initial_replicas

    # 4. Verify new node physically possesses the file
    new_node = storage_manager.get_node(new_node_name)
    assert new_node.object_exists(object_name)
    assert new_node.read_object_bytes(object_name) == payload

    # 5. Verify metadata catalog updated to reflect new healthy replica
    meta = client.get(f"/objects/{object_name}/metadata").json()
    assert new_node_name in meta["replicas"]
    assert len(meta["replicas"]) == 3


def test_repair_already_healthy_skips(client: TestClient):
    """Verify that repairing an already-healthy object performs no modifications."""
    object_name = "already_good.txt"
    client.put(f"/objects/{object_name}", content=b"Perfect data")

    repair_res = client.post(f"/admin/repair/{object_name}")
    assert repair_res.status_code == 200
    data = repair_res.json()
    assert data["status"] == "already_healthy"
    assert len(data["actions"]) == 0
    assert data["final_healthy_count"] == 3


def test_cluster_wide_repair(client: TestClient):
    """Verify cluster-wide repair heals all degraded objects in a single pass."""
    # Object 1: corrupted
    client.put("/objects/obj1.txt", content=b"object one data")
    rep1 = client.get("/objects/obj1.txt/metadata").json()["replicas"][0]
    client.post(f"/admin/nodes/{rep1}/corrupt/obj1.txt")

    # Object 2: clean
    client.put("/objects/obj2.txt", content=b"object two clean")

    # Run cluster repair
    res = client.post("/admin/repair")
    assert res.status_code == 200
    data = res.json()
    assert data["total_scanned"] >= 2
    assert data["repaired_count"] >= 1
    assert data["healthy_count"] >= 1

    # Verify obj1 is now healthy
    v1 = client.get("/objects/obj1.txt/verify").json()
    assert v1["is_healthy"] is True


def test_repair_concurrency_guard(client: TestClient):
    """Verify that multiple concurrent repairs for the same object are blocked."""
    object_name = "locked_obj.txt"
    client.put(f"/objects/{object_name}", content=b"Concurrent guard test")

    # Manually acquire the repair lock
    repair_manager._in_progress_repairs.add(object_name)
    try:
        # Attempt repair
        res = client.post(f"/admin/repair/{object_name}")
        assert res.status_code == 200
        assert res.json()["status"] == "in_progress"

        status_res = client.get("/admin/repair/status")
        assert status_res.status_code == 200
        assert object_name in status_res.json()["active_repairs"]
    finally:
        repair_manager._in_progress_repairs.discard(object_name)
