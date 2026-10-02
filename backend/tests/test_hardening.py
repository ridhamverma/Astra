"""Phase 19: ingress, execution, numerical edge cases and production safeguards."""

import asyncio
from copy import deepcopy
from uuid import uuid4
from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from sqlalchemy import inspect
from alembic import command
from alembic.config import Config
from app.config import Settings
from app.main import create_app
from app.api.hardening import RequestSafetyMiddleware, MAX_BODY_BYTES
from app.schemas.simulation import SimulationModel
from app.simulation import simulate, UnsupportedModelError, SimulationLimitError
from app.templates import get_template
from test_persistence import (
    test_database as test_database,
    client_for,
    simple_model,
    BACKEND,
)


def fixture_model(arrival=10, service=2, resources=1, duration=60, maximum=None):
    model = simple_model()
    model["simulation"].update(duration=duration, seed=42)
    model["nodes"][0]["config"] = {
        "distribution": "constant",
        "mean_interarrival_time": arrival,
        "max_entities": maximum,
    }
    model["nodes"][1]["config"] = {
        "service_distribution": "constant",
        "mean_service_time": service,
        "resource_count": resources,
    }
    return model


@pytest.mark.parametrize("kind", ["process", "sink"])
def test_orphan_nodes_rejected_before_execution(kind):
    model = fixture_model()
    node = deepcopy(model["nodes"][1 if kind == "process" else 2])
    node["id"] = "orphan"
    model["nodes"].append(node)
    if kind == "process":
        model["edges"].append(
            {"id": "orphan-exit", "source": "orphan", "target": model["nodes"][2]["id"]}
        )
    with pytest.raises(UnsupportedModelError, match="disconnected"):
        simulate(model)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda m: m["nodes"][0].update(id="x" * 129),
        lambda m: m["nodes"][1].update(name="x" * 201),
        lambda m: m["nodes"][0]["position"].update(x=1e100),
    ],
)
def test_bounded_ids_labels_positions(mutation):
    model = fixture_model()
    mutation(model)
    with pytest.raises(ValidationError):
        SimulationModel.model_validate(model)


@pytest.mark.parametrize(
    "arrival,service,resources,duration,maximum,generated,completed",
    [
        (1000000, 2, 1, 10080, None, 1, 1),
        (10, 1000000, 1, 60, None, 6, 0),
        (0.01, 0.001, 100, 10080, 10000, 10000, 10000),
        (10, 2, 100, 60, None, 6, 6),
    ],
)
def test_edge_demand_horizon_resources(
    arrival, service, resources, duration, maximum, generated, completed
):
    result = simulate(fixture_model(arrival, service, resources, duration, maximum))
    assert (
        result.summary.total_generated == generated
        and result.summary.total_completed == completed
    )
    assert result.summary.in_system_at_end == generated - completed
    assert result.summary.throughput == pytest.approx(completed * 60 / duration)
    metric = next(iter(result.node_metrics.values()))
    assert 0 <= metric.resource_utilization <= 1
    assert (
        result.summary.average_cycle_time is None
        if completed == 0
        else result.summary.average_cycle_time == pytest.approx(service)
    )


def test_extreme_demand_stops_and_wall_clock_guard(monkeypatch):
    with pytest.raises(SimulationLimitError, match="generated entities"):
        simulate(fixture_model(0.000001, 5, 1, 60))
    monkeypatch.setattr("app.simulation.engine.MAX_RUN_SECONDS", -1)
    with pytest.raises(SimulationLimitError, match="execution time"):
        simulate(fixture_model())


def test_event_ceiling_on_long_workflow():
    model = get_template("warehouse").model.model_dump(mode="json")
    model["nodes"][0]["config"].update(
        distribution="constant", mean_interarrival_time=0.01, max_entities=10000
    )
    for n in model["nodes"]:
        if n["type"] == "process":
            n["config"] = {
                "resource_count": 100,
                "service_distribution": "constant",
                "mean_service_time": 0.001,
            }
        if n["type"] == "delay":
            n["config"] = {"distribution": "constant", "mean_delay": 0.001}
    with pytest.raises(SimulationLimitError, match="logged events"):
        simulate(model)


def test_large_body_and_errors_keep_cors_and_no_secrets():
    c = TestClient(create_app(), raise_server_exceptions=False)
    response = c.post(
        "/api/v1/auth/login",
        content=b"x" * (MAX_BODY_BYTES + 1),
        headers={"Origin": "http://localhost:3000", "Content-Type": "application/json"},
    )
    assert (
        response.status_code == 413
        and response.headers["access-control-allow-origin"] == "http://localhost:3000"
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "Traceback" not in response.text


def test_chunked_ingress_and_parallel_work_are_bounded():
    async def check():
        entered = asyncio.Event()
        release = asyncio.Event()
        called = 0

        async def app(scope, receive, send):
            nonlocal called
            called += 1
            entered.set()
            await release.wait()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"{}"})

        middleware = RequestSafetyMiddleware(app)
        scope = {"type": "http", "path": "/api/v1/simulations/run", "method": "POST"}

        async def receive():
            return {"type": "http.request", "body": b"{}", "more_body": False}

        output = []

        async def send(message):
            output.append(message)

        tasks = [
            asyncio.create_task(middleware(scope, receive, send)) for _ in range(2)
        ]
        await entered.wait()
        await asyncio.sleep(0)
        await middleware(scope, receive, send)
        assert any(m.get("status") == 429 for m in output)
        release.set()
        await asyncio.gather(*tasks)
        assert called == 2
        output.clear()
        await middleware(scope, receive, send)  # Slots released, even across responses.
        assert output[0]["status"] == 200
        chunks = iter(
            [
                {
                    "type": "http.request",
                    "body": b"x" * (MAX_BODY_BYTES // 2 + 1),
                    "more_body": True,
                }
            ]
            * 2
        )

        async def chunked():
            return next(chunks)

        output.clear()
        before = called
        await middleware(scope, chunked, send)
        assert output[0]["status"] == 413 and called == before

    asyncio.run(check())


def test_failed_response_is_sanitized_with_cors(monkeypatch, test_database):
    c = client_for(test_database)

    def broken(_):
        raise RuntimeError("private-password-token")

    monkeypatch.setattr("app.api.routes.simulations.simulate", broken)
    r = c.post(
        "/api/v1/simulations/run",
        json=fixture_model(),
        headers={"Origin": "http://localhost:3000"},
    )
    assert (
        r.status_code == 500
        and r.headers["access-control-allow-origin"] == "http://localhost:3000"
    )
    assert "private-password-token" not in r.text and "Traceback" not in r.text


@pytest.mark.parametrize(
    "origins",
    [
        ["*"],
        ["https://*"],
        ["https://site.example/path"],
        ["https://name:password@site.example"],
    ],
)
def test_cors_rejects_wildcards_paths_credentials(origins):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=origins)


def test_production_fail_closed_and_secure_cookie(monkeypatch, test_database):
    with pytest.raises(ValidationError) as caught:
        Settings(
            _env_file=None,
            environment="production",
            gemini_api_key="private-config-secret",
        )
    assert "private-config-secret" not in str(caught.value)
    good = Settings(
        _env_file=None,
        environment="production",
        cookie_secure=True,
        cors_origins=["https://astra.example"],
        database_url="postgresql://user:private@host/db",
    )
    monkeypatch.setattr("app.api.routes.auth.get_settings", lambda: good)
    c = client_for(test_database, authenticated=False)
    r = c.post(
        "/api/v1/auth/register",
        json={
            "email": f"secure-{uuid4().hex}@example.com",
            "display_name": "Secure",
            "password": "test-only-secure-passphrase",
        },
    )
    assert (
        r.status_code == 201
        and "Secure" in r.headers["set-cookie"]
        and "HttpOnly" in r.headers["set-cookie"]
    )


def test_sql_payload_is_data_not_a_query(test_database):
    c = client_for(test_database)
    name = "Robert'); DROP TABLE projects; --"
    created = c.post("/api/v1/projects", json={"name": name}).json()
    assert c.get(f"/api/v1/projects/{created['id']}").json()["name"] == name
    assert c.get("/api/v1/projects").status_code == 200
    assert c.get("/api/v1/projects/1%20OR%201=1").status_code == 400


def test_all_migrations_downgrade_upgrade(test_database):
    # Disposable database only: the fixture creates a unique PostgreSQL database.
    config = Config(str(BACKEND / "alembic.ini"))
    config.attributes["database_url"] = test_database.url.render_as_string(
        hide_password=False
    )
    command.downgrade(config, "base")
    assert set(inspect(test_database).get_table_names()) <= {"alembic_version"}
    command.upgrade(config, "head")
    assert {
        "users",
        "projects",
        "scenarios",
        "simulation_runs",
        "auth_sessions",
    } <= set(inspect(test_database).get_table_names())


@pytest.mark.parametrize("seed", [-2147483649, 2147483648])
def test_seed_outside_database_range_is_rejected(seed):
    model = fixture_model()
    model["simulation"]["seed"] = seed
    with pytest.raises(ValidationError):
        SimulationModel.model_validate(model)


def test_slow_request_body_times_out_and_releases_capacity(monkeypatch):
    monkeypatch.setattr("app.api.hardening.MAX_BODY_SECONDS", 0.01)

    async def check():
        called = False

        async def app(scope, receive, send):
            nonlocal called
            called = True

        middleware = RequestSafetyMiddleware(app)
        scope = {"type": "http", "method": "POST", "path": "/api/v1/simulations/run"}

        async def receive():
            await asyncio.Event().wait()

        output = []

        async def send(message):
            output.append(message)

        await middleware(scope, receive, send)
        assert output[0]["status"] == 408 and not called
        assert middleware.runs.acquire(blocking=False)
        assert middleware.runs.acquire(blocking=False)
        middleware.runs.release()
        middleware.runs.release()

    asyncio.run(check())
