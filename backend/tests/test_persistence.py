"""PostgreSQL integration tests: migrations, model versions, and restart reads."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.database.session import get_db, psycopg_url
from app.main import create_app
from app.schemas.simulation import SimulationModel
from app.simulation import simulate


EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def test_database():
    configured_url = get_settings().database_url
    if not configured_url:
        pytest.skip("PostgreSQL integration tests require ASTRA_DATABASE_URL")
    from sqlalchemy.engine import make_url

    base_url = make_url(psycopg_url(configured_url))
    database_name = f"astra_test_{uuid4().hex}"
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        test_url = base_url.set(database=database_name)
        alembic = Config(str(BACKEND / "alembic.ini"))
        alembic.attributes["database_url"] = test_url.render_as_string(hide_password=False)
        command.upgrade(alembic, "head")
        engine = create_engine(test_url)
        try:
            yield engine
        finally:
            engine.dispose()
    finally:
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}" WITH (FORCE)'))
        admin.dispose()


def client_for(engine, previous=None, *, authenticated=True) -> TestClient:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    application = create_app()

    def session_override():
        with factory() as session:
            yield session

    application.dependency_overrides[get_db] = session_override
    client = TestClient(application)
    if previous is not None:
        client.cookies.update(previous.cookies)
        client.headers.update({"X-Astra-CSRF": previous.headers["X-Astra-CSRF"]})
    elif authenticated:
        response = client.post("/api/v1/auth/register", json={"email": f"test-{uuid4().hex}@example.com", "display_name": "Test user", "password": "test-only-long-passphrase"})
        assert response.status_code == 201, response.text
        client.headers["X-Astra-CSRF"] = response.json()["csrf_token"]
    return client


def simple_model() -> dict:
    return json.loads((EXAMPLES / "simple.json").read_text())


def test_library_activity_and_status_use_saved_models_and_runs(test_database):
    client = client_for(test_database)
    project = client.post("/api/v1/projects", json={"name": "Activity model", "model": simple_model()}).json()
    project_id = project["id"]
    assert project["status"] == "needs_review" and project["run_count"] == 0
    assert client.post(f"/api/v1/projects/{project_id}/access").status_code == 204
    opened = client.get(f"/api/v1/projects/{project_id}").json()
    assert opened["last_accessed_at"] is not None
    assert opened["updated_at"] == project["updated_at"]
    assert client.post(f"/api/v1/projects/{project_id}/runs", json={}).status_code == 201
    library = client.get("/api/v1/projects").json()
    summary = next(item for item in library if item["id"] == project_id)
    assert summary["run_count"] == 1 and summary["status"] == "completed"
    assert summary["last_run_at"] and summary["model"] == project["model"]
    modified = simple_model()
    modified["nodes"][1]["config"]["resource_count"] = 2
    client.put(f"/api/v1/projects/{project_id}", json={"model": modified})
    summary = next(item for item in client.get("/api/v1/projects").json() if item["id"] == project_id)
    assert summary["status"] == "needs_review" and summary["run_count"] == 1


def test_library_access_tracking_remains_owner_scoped(test_database):
    owner, other = client_for(test_database), client_for(test_database)
    project = owner.post("/api/v1/projects", json={"name": "Private model"}).json()
    assert other.post(f"/api/v1/projects/{project['id']}/access").status_code == 404
    assert all(item["id"] != project["id"] for item in other.get("/api/v1/projects").json())
    assert owner.get(f"/api/v1/projects/{project['id']}").json()["last_accessed_at"] is None


def test_migration_tables_and_compact_run_storage(test_database) -> None:
    inspector = inspect(test_database)
    assert {"users", "projects", "simulation_model_versions", "simulation_runs"} <= set(inspector.get_table_names())
    run_columns = {column["name"] for column in inspector.get_columns("simulation_runs")}
    assert {"summary", "node_metrics", "time_series", "seed", "duration", "version"} <= run_columns
    assert "events" not in run_columns


def test_project_model_run_and_restart_round_trip(test_database) -> None:
    client = client_for(test_database)
    model = simple_model()
    created = client.post("/api/v1/projects", json={"name": "Clinic", "description": "First version", "model": model})
    assert created.status_code == 201, created.text
    project_id = created.json()["id"]
    assert created.json()["latest_version"] == 1
    canonical = SimulationModel.model_validate(model).model_dump(mode="json")
    assert created.json()["model"] == canonical

    expected = simulate(model)
    run_response = client.post(f"/api/v1/projects/{project_id}/runs", json={})
    assert run_response.status_code == 201, run_response.text
    run = run_response.json()
    assert run["summary"] == expected.summary.model_dump(mode="json")
    assert run["node_metrics"] == {key: value.model_dump(mode="json") for key, value in expected.node_metrics.items()}
    assert run["time_series"] == expected.time_series.model_dump(mode="json")
    assert "events" not in run

    # A new FastAPI app and new sessions read the records written by the first app.
    restarted = client_for(test_database, previous=client)
    assert restarted.get(f"/api/v1/projects/{project_id}").json()["model"] == canonical
    assert restarted.get(f"/api/v1/runs/{run['id']}").json()["summary"] == run["summary"]
    assert restarted.get(f"/api/v1/projects/{project_id}/runs").json() == [run]
    assert any(item["id"] == project_id for item in restarted.get("/api/v1/projects").json())

    with Session(test_database) as session:
        saved = session.execute(text("SELECT summary, node_metrics, time_series FROM simulation_runs WHERE id = :id"), {"id": run["id"]}).one()
        assert saved.summary == run["summary"]
        assert saved.node_metrics == run["node_metrics"]
        assert saved.time_series == run["time_series"]

    updated_model = simple_model()
    updated_model["nodes"][1]["config"]["resource_count"] = 2
    updated = restarted.put(f"/api/v1/projects/{project_id}", json={"name": "Clinic B", "model": updated_model})
    assert updated.status_code == 200, updated.text
    assert updated.json()["latest_version"] == 2
    assert updated.json()["model"] == SimulationModel.model_validate(updated_model).model_dump(mode="json")
    assert updated.json()["name"] == "Clinic B"

    old_run = restarted.post(f"/api/v1/projects/{project_id}/runs", json={"model_version": 1})
    assert old_run.status_code == 201
    assert old_run.json()["model_version"] == 1
    assert old_run.json()["summary"] == run["summary"]
    new_run = restarted.post(f"/api/v1/projects/{project_id}/runs", json={})
    assert new_run.status_code == 201
    assert new_run.json()["model_version"] == 2
    assert len(restarted.get(f"/api/v1/projects/{project_id}/runs").json()) == 3

    assert restarted.delete(f"/api/v1/projects/{project_id}").status_code == 204
    assert restarted.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert restarted.get(f"/api/v1/runs/{run['id']}").status_code == 404


def test_invalid_models_and_missing_resources(test_database) -> None:
    client = client_for(test_database)
    model = simple_model()
    model["nodes"][1]["config"]["resource_count"] = 0
    rejected = client.post("/api/v1/projects", json={"name": "Invalid", "model": model})
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "invalid_configuration"
    assert client.get("/api/v1/projects").json() == []

    unknown = str(uuid4())
    assert client.get(f"/api/v1/projects/{unknown}").status_code == 404
    assert client.post(f"/api/v1/projects/{unknown}/runs", json={}).status_code == 404

    project = client.post("/api/v1/projects", json={"name": "No model"}).json()
    assert project["latest_version"] is None
    assert client.post(f"/api/v1/projects/{project['id']}/runs", json={}).status_code == 404
    assert client.put(f"/api/v1/projects/{project['id']}", json={"name": "Renamed", "description": "Ready"}).json()["name"] == "Renamed"


def test_transient_playback_matches_engine_and_exact_requested_version(test_database):
    client = client_for(test_database)
    model = simple_model()
    project = client.post("/api/v1/projects", json={"name": "Playback", "model": model}).json()
    changed = simple_model()
    changed["nodes"][1]["config"]["resource_count"] = 3
    client.put(f"/api/v1/projects/{project['id']}", json={"model": changed})
    response = client.post(f"/api/v1/projects/{project['id']}/runs", json={"model_version": 1, "include_timeline": True})
    assert response.status_code == 201, response.text
    run = response.json()
    expected = simulate(model)
    assert run["events"] == [event.model_dump(mode="json") for event in expected.events]
    assert run["model"] == SimulationModel.model_validate(model).model_dump(mode="json")
    assert run["summary"] == expected.summary.model_dump(mode="json")
    assert run["model_version"] == 1
    compact = client.get(f"/api/v1/runs/{run['id']}").json()
    assert "events" not in compact and "model" not in compact
    assert compact == {key: value for key, value in run.items() if key not in {"events", "model"}}
