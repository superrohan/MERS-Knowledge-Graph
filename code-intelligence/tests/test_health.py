from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_public_health_ok():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["service"] == "code-intelligence"


def test_internal_health_requires_secret():
    res = client.get("/internal/health")
    assert res.status_code == 401


def test_internal_health_with_valid_secret():
    res = client.get(
        "/internal/health",
        headers={"X-Internal-Secret": settings.internal_service_secret},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
