import hashlib
from fastapi.testclient import TestClient


def test_initial_upload_creates_version_1(client: TestClient):
    """Verify that uploading a new object assigns version 1, computes SHA-256, and generates object_id."""
    object_name = "doc.txt"
    payload = b"Initial document content"
    expected_checksum = hashlib.sha256(payload).hexdigest()

    response = client.put(f"/objects/{object_name}", content=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["version"] == 1
    assert data["checksum"] == expected_checksum
    assert data["size"] == len(payload)
    assert data["object_id"] is not None
    assert len(data["replicas"]) == 3


def test_subsequent_uploads_increment_versions(client: TestClient):
    """Verify that updating an object increments versions: v1 -> v2 -> v3."""
    object_name = "evolving_notes.txt"

    # Upload Version 1
    v1_content = b"Draft 1 notes"
    res1 = client.put(f"/objects/{object_name}", content=v1_content)
    assert res1.status_code == 201
    assert res1.json()["version"] == 1

    # Upload Version 2
    v2_content = b"Draft 2 with revisions"
    res2 = client.put(f"/objects/{object_name}", content=v2_content)
    assert res2.status_code == 201
    assert res2.json()["version"] == 2
    assert res2.json()["size"] == len(v2_content)
    assert res2.json()["checksum"] == hashlib.sha256(v2_content).hexdigest()

    # Upload Version 3
    v3_content = b"Final published version 3"
    res3 = client.put(f"/objects/{object_name}", content=v3_content)
    assert res3.status_code == 201
    assert res3.json()["version"] == 3

    # Default download must return latest version (Version 3)
    latest_download = client.get(f"/objects/{object_name}")
    assert latest_download.status_code == 200
    assert latest_download.content == v3_content
    assert latest_download.headers["x-vault-version"] == "3"


def test_download_historical_versions(client: TestClient):
    """Verify that clients can download historical versions via ?version=N."""
    object_name = "history_file.dat"
    v1_bytes = b"BINARY_DATA_V1"
    v2_bytes = b"BINARY_DATA_V2_MODIFIED"

    client.put(f"/objects/{object_name}", content=v1_bytes)
    client.put(f"/objects/{object_name}", content=v2_bytes)

    # Download v1
    v1_res = client.get(f"/objects/{object_name}?version=1")
    assert v1_res.status_code == 200
    assert v1_res.content == v1_bytes
    assert v1_res.headers["x-vault-version"] == "1"

    # Download v2
    v2_res = client.get(f"/objects/{object_name}?version=2")
    assert v2_res.status_code == 200
    assert v2_res.content == v2_bytes
    assert v2_res.headers["x-vault-version"] == "2"

    # Download non-existent v99
    v99_res = client.get(f"/objects/{object_name}?version=99")
    assert v99_res.status_code == 404


def test_object_version_history_endpoint(client: TestClient):
    """Verify the /objects/{name}/versions endpoint returns full version history."""
    object_name = "changelog.md"
    client.put(f"/objects/{object_name}", content=b"# Version 1")
    client.put(f"/objects/{object_name}", content=b"# Version 2")

    response = client.get(f"/objects/{object_name}/versions")
    assert response.status_code == 200
    data = response.json()
    assert data["object_name"] == object_name
    assert data["current_version"] == 2
    assert len(data["versions"]) == 2

    # Versions listed in descending order (v2, then v1)
    assert data["versions"][0]["version"] == 2
    assert data["versions"][1]["version"] == 1
    assert data["versions"][0]["checksum"] == hashlib.sha256(b"# Version 2").hexdigest()


def test_metadata_and_head_include_version_and_checksum(client: TestClient):
    """Verify metadata and HEAD endpoints include version and SHA-256 checksum."""
    object_name = "payload.json"
    content = b'{"status": "ok"}'
    expected_sum = hashlib.sha256(content).hexdigest()

    client.put(f"/objects/{object_name}", content=content)

    # Test GET metadata
    meta_res = client.get(f"/objects/{object_name}/metadata")
    assert meta_res.status_code == 200
    meta = meta_res.json()
    assert meta["version"] == 1
    assert meta["checksum"] == expected_sum
    assert meta["size"] == len(content)

    # Test HEAD request
    head_res = client.head(f"/objects/{object_name}")
    assert head_res.status_code == 200
    assert head_res.headers["x-vault-version"] == "1"
    assert head_res.headers["x-vault-checksum"] == expected_sum
    assert head_res.headers["etag"] == f'"{expected_sum}"'
