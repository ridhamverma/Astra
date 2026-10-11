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


def test_readiness_rejects_missing_configuration(monkeypatch):
    from app.config import Settings
    monkeypatch.setattr("app.api.routes.health.get_settings", lambda: Settings(_env_file=None, database_url=None))
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    assert "ASTRA_DATABASE_URL" in response.json()["error"]["message"]
    assert TestClient(app).get("/health").status_code == 200


def test_readiness_rejects_outdated_schema(monkeypatch):
    monkeypatch.setattr("app.api.routes.health.required_database_heads", lambda: {"new-required-migration"})
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    assert "migrations" in response.json()["error"]["message"]


def test_readiness_database_failure_has_a_valid_sanitized_error(monkeypatch):
    def unavailable():
        raise RuntimeError('private connection details')
    monkeypatch.setattr('app.database.session.get_engine', unavailable)
    response = TestClient(app).get('/health/ready')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'service_unavailable'
    assert 'private connection' not in response.text


def test_readiness_does_not_advertise_an_unsupported_ai_provider(monkeypatch):
    from app.config import get_settings
    from pydantic import SecretStr
    settings = get_settings().model_copy(update={'ai_provider': 'unsupported', 'gemini_api_key': SecretStr('test-key')})
    monkeypatch.setattr('app.api.routes.health.get_settings', lambda: settings)
    response = TestClient(app).get('/health/ready')
    assert response.status_code == 200
    assert response.json()['ai_enabled'] is False


