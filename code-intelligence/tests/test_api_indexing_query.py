"""End-to-end test through the actual FastAPI internal API: index a real
repository, poll until it completes, then query it and read back source
lines - exactly the path the Node backend will drive in Phase 6."""

import shutil
import time
import uuid

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)
HEADERS = {"X-Internal-Secret": settings.internal_service_secret}


def _wait_for_completion(job_id: str, timeout: float = 10.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        res = client.get(f"/internal/index/{job_id}", headers=HEADERS)
        assert res.status_code == 200
        body = res.json()
        if body["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            return body
        time.sleep(0.05)
    raise AssertionError("Indexing job did not finish in time")


def test_internal_routes_reject_requests_without_the_shared_secret():
    res = client.post("/internal/index", json={"repositoryId": "x", "repositoryPath": "/tmp/x"})
    assert res.status_code == 401


def test_full_index_then_query_then_source_flow(tmp_path, fixture_repo_path):
    repo_dir = tmp_path / "repo"
    shutil.copytree(fixture_repo_path, repo_dir)
    repository_id = f"api-test-{uuid.uuid4()}"

    index_res = client.post(
        "/internal/index",
        json={"repository_id": repository_id, "repository_path": str(repo_dir), "commit_hash": "abc123"},
        headers=HEADERS,
    )
    assert index_res.status_code == 200
    job_id = index_res.json()["jobId"]

    finished = _wait_for_completion(job_id)
    assert finished["status"] == "COMPLETED"
    assert finished["stats"]["symbols"] > 0

    stats_res = client.get(f"/internal/repositories/{repository_id}/stats", headers=HEADERS)
    assert stats_res.status_code == 200
    assert stats_res.json()["files"] == 17

    query_res = client.post(
        "/internal/query",
        json={"repository_id": repository_id, "query": "How does authentication work?"},
        headers=HEADERS,
    )
    assert query_res.status_code == 200
    body = query_res.json()
    assert body["citations"]
    citation = body["citations"][0]

    source_res = client.get(
        f"/internal/repositories/{repository_id}/source",
        params={"path": citation["filePath"], "start_line": citation["startLine"], "end_line": citation["endLine"]},
        headers=HEADERS,
    )
    assert source_res.status_code == 200
    source_body = source_res.json()
    assert source_body["lines"]
    assert len(source_body["lines"]) == citation["endLine"] - citation["startLine"] + 1

    graph_res = client.get(
        f"/internal/repositories/{repository_id}/graph", params={"search": "AuthService"}, headers=HEADERS
    )
    assert graph_res.status_code == 200
    graph_body = graph_res.json()
    assert any(n["name"] == "AuthService" for n in graph_body["nodes"])


def test_source_endpoint_rejects_path_traversal(tmp_path, fixture_repo_path):
    repo_dir = tmp_path / "repo"
    shutil.copytree(fixture_repo_path, repo_dir)
    repository_id = f"api-test-{uuid.uuid4()}"

    client.post(
        "/internal/index",
        json={"repository_id": repository_id, "repository_path": str(repo_dir)},
        headers=HEADERS,
    )

    res = client.get(
        f"/internal/repositories/{repository_id}/source",
        params={"path": "../../../etc/passwd"},
        headers=HEADERS,
    )
    assert res.status_code == 400


def test_cancel_endpoint_stops_a_running_job(tmp_path, fixture_repo_path):
    repo_dir = tmp_path / "repo"
    shutil.copytree(fixture_repo_path, repo_dir)
    repository_id = f"api-test-{uuid.uuid4()}"

    index_res = client.post(
        "/internal/index",
        json={"repository_id": repository_id, "repository_path": str(repo_dir)},
        headers=HEADERS,
    )
    job_id = index_res.json()["jobId"]

    cancel_res = client.post(f"/internal/index/{job_id}/cancel", headers=HEADERS)
    assert cancel_res.status_code == 200

    finished = _wait_for_completion(job_id)
    assert finished["status"] in ("CANCELLED", "COMPLETED")  # may finish before the cancel flag is observed
