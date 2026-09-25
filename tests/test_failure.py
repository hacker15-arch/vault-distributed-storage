from fastapi.testclient import TestClient


def test_cluster_health_initially_healthy(client: TestClient):
    """Verify that all nodes are initially diagnosed as healthy by the failure detector."""
    res = client.get("/admin/health/cluster")
    assert res.status_code == 200
    data = res.json()
    assert data["cluster_status"] == "healthy"
    assert data["total_nodes"] == 5
    assert data["healthy_nodes"] == 5
    assert data["failed_nodes"] == 0
    assert data["slow_nodes"] == 0


def test_node_failure_detection_and_consecutive_tracking(client: TestClient):
    """Verify taking a node offline transitions it to 'offline' and increments failure counts."""
    # Take node2 offline
    client.post("/nodes/node2/offline")

    # Run active probe
    probe_res = client.post("/admin/health/probe")
    assert probe_res.status_code == 200
    data = probe_res.json()
    assert data["cluster_status"] == "degraded"
    assert data["failed_nodes"] == 1

    node2_check = next(n for n in data["node_checks"] if n["node_name"] == "node2")
    assert node2_check["status"] == "offline"
    assert node2_check["is_online"] is False
    assert node2_check["consecutive_failures"] >= 1


def test_node_recovery(client: TestClient):
    """Verify bringing an offline node back online resets consecutive failures and restores health."""
    # Take node3 offline
    client.post("/nodes/node3/offline")
    check1 = client.get("/admin/nodes/node3/health").json()
    assert check1["status"] == "offline"

    # Recover node3
    client.post("/nodes/node3/online")
    check2 = client.get("/admin/nodes/node3/health").json()
    assert check2["status"] == "healthy"
    assert check2["is_online"] is True
    assert check2["consecutive_failures"] == 0


def test_slow_node_simulation(client: TestClient):
    """Verify simulating disk/network delay flags node as 'slow'."""
    # Set delay of 120ms (above 100ms slow threshold)
    slow_res = client.post("/admin/nodes/node1/slow", json={"delay_seconds": 0.12})
    assert slow_res.status_code == 200
    data = slow_res.json()
    assert data["status"] == "slow"
    assert data["is_slow"] is True
    assert data["latency_ms"] >= 100.0

    # Reset delay back to 0
    clean_res = client.post("/admin/nodes/node1/slow", json={"delay_seconds": 0.0})
    assert clean_res.status_code == 200
    assert clean_res.json()["status"] == "healthy"


def test_network_partition_simulation(client: TestClient):
    """Verify simulating a network partition marks node as 'partitioned' and unpartitioning restores it."""
    # Partition node4
    part_res = client.post("/admin/nodes/node4/partition")
    assert part_res.status_code == 200
    data = part_res.json()
    assert data["status"] == "partitioned"
    assert data["is_partitioned"] is True

    # Health check reflects partitioned state
    check = client.get("/admin/nodes/node4/health").json()
    assert check["status"] == "partitioned"

    # Unpartition node4
    unpart_res = client.post("/admin/nodes/node4/unpartition")
    assert unpart_res.status_code == 200
    assert unpart_res.json()["status"] == "healthy"
    assert unpart_res.json()["is_partitioned"] is False


def test_availability_during_multiple_node_failures(client: TestClient):
    """Verify object remains readable as long as at least ONE healthy replica survives."""
    object_name = "durable_survivor.txt"
    payload = b"Survives multiple server crashes"

    # Upload with 3 replicas
    put_res = client.put(f"/objects/{object_name}", content=payload)
    assert put_res.status_code == 201
    replicas = put_res.json()["replicas"]
    assert len(replicas) == 3

    nodeA, nodeB, nodeC = replicas[0], replicas[1], replicas[2]

    # Failure 1: Node A crashes
    client.post(f"/nodes/{nodeA}/offline")
    get1 = client.get(f"/objects/{object_name}")
    assert get1.status_code == 200
    assert get1.content == payload
    assert get1.headers["x-vault-served-by"] in (nodeB, nodeC)

    # Failure 2: Node B also crashes (2 out of 3 replicas dead!)
    client.post(f"/nodes/{nodeB}/offline")
    get2 = client.get(f"/objects/{object_name}")
    assert get2.status_code == 200
    assert get2.content == payload
    assert get2.headers["x-vault-served-by"] == nodeC

    # Failure 3: Node C crashes (all 3 replicas dead)
    client.post(f"/nodes/{nodeC}/offline")
    get3 = client.get(f"/objects/{object_name}")
    assert get3.status_code == 404

    # Recovery: Bring Node B back online
    client.post(f"/nodes/{nodeB}/online")
    get4 = client.get(f"/objects/{object_name}")
    assert get4.status_code == 200
    assert get4.content == payload
    assert get4.headers["x-vault-served-by"] == nodeB
