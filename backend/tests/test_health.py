from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_success() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "astra-backend"}


def test_local_frontend_cors() -> None:
    response = TestClient(app).options(
        "/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_readiness_probe_returns_ready() -> None:
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["service"] == "astra-backend"
    assert "database" in data
    assert "environment" in data


def test_api_v1_health_alias() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


