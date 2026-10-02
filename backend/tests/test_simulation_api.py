import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulation import simulate


EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"
VALIDATE = "/api/v1/simulations/validate"
RUN = "/api/v1/simulations/run"


def example(name: str = "simple") -> dict:
    return json.loads((EXAMPLES / f"{name}.json").read_text())


@pytest.mark.parametrize("name", ["simple", "bank", "hospital"])
def test_run_matches_direct_engine_result(name: str) -> None:
    model = example(name)
    client = TestClient(app)
    assert client.post(VALIDATE, json=model).json() == {"valid": True, "errors": []}

    response = client.post(RUN, json=model)
    assert response.status_code == 200
    assert response.json() == simulate(model).model_dump(mode="json")
    assert set(response.json()) == {"simulationId", "summary", "nodeMetrics", "timeSeries", "events", "entities", "bottleneckAnalysis"}


@pytest.mark.parametrize(
    "change, code, path_fragment",
    [
        (lambda model: model["simulation"].update(duration=0), "invalid_configuration", "duration"),
        (lambda model: model["nodes"][1]["config"].update(resource_count=0), "invalid_configuration", "resource_count"),
        (lambda model: model["nodes"][0]["config"].update(distribution="normal"), "unsupported_input", "distribution"),
        (lambda model: model["nodes"][1].update(type="machine"), "unsupported_input", "nodes"),
        (lambda model: model["edges"][0].update(target="unknown"), "invalid_graph", "model"),
    ],
)
def test_validate_returns_displayable_errors(change, code: str, path_fragment: str) -> None:
    model = example()
    change(model)
    response = TestClient(app).post(VALIDATE, json=model)
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["errors"]
    assert body["errors"][0]["code"] == code
    assert path_fragment in body["errors"][0]["path"]
    assert body["errors"][0]["message"]


def test_run_rejects_invalid_configuration_without_traceback() -> None:
    model = example()
    model["nodes"][1]["config"]["resource_count"] = 0
    response = TestClient(app).post(RUN, json=model)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_configuration"
    assert "resource_count" in response.json()["error"]["details"][0]["path"]
    assert "Traceback" not in response.text


def test_cycles_and_missing_source_are_graph_errors() -> None:
    hospital = example("hospital")
    next(edge for edge in hospital["edges"] if edge["id"] == "e-pharmacy-discharge")["target"] = "next-step"
    response = TestClient(app).post(VALIDATE, json=hospital)
    assert response.status_code == 200
    assert response.json()["errors"][0]["code"] == "invalid_graph"
    assert "cycle" in response.json()["errors"][0]["message"]

    simple = example()
    simple["nodes"] = [node for node in simple["nodes"] if node["type"] != "source"]
    simple["edges"] = []
    response = TestClient(app).post(RUN, json=simple)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_graph"


def test_unsupported_body_and_bad_json_have_consistent_errors() -> None:
    client = TestClient(app)
    array_response = client.post(RUN, json=[1, 2, 3])
    assert array_response.status_code == 400
    assert array_response.json()["error"]["code"] == "unsupported_input"

    malformed = client.post(RUN, content="{not-json", headers={"content-type": "application/json"})
    assert malformed.status_code == 400
    assert malformed.json()["error"]["code"] == "unsupported_input"
    assert "Traceback" not in malformed.text


@pytest.mark.parametrize(
    "change, path_fragment",
    [
        (lambda model: model["simulation"].update(duration=10_081), "simulation.duration"),
        (lambda model: model["nodes"][0]["config"].update(max_entities=10_001), "max_entities"),
        (lambda model: model["nodes"][1]["config"].update(resource_count=101), "resource_count"),
        (lambda model: model.update(nodes=model["nodes"] * 34), "nodes"),
        (lambda model: model.update(edges=model["edges"] * 151), "edges"),
    ],
)
def test_api_limits_are_checked_before_running(change, path_fragment: str) -> None:
    model = example()
    change(model)
    client = TestClient(app)
    validation = client.post(VALIDATE, json=model).json()
    assert validation["valid"] is False
    assert validation["errors"][0]["code"] == "invalid_configuration"
    assert path_fragment in validation["errors"][0]["path"]

    response = client.post(RUN, json=model)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_configuration"


def test_event_log_limit_is_a_failed_simulation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.simulation.engine.MAX_EVENTS_PER_RUN", 3)
    response = TestClient(app).post(RUN, json=example())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "failed_simulation"
    assert "logged events" in response.json()["error"]["details"][0]["message"]
    assert "Traceback" not in response.text


def test_entity_limit_is_a_failed_simulation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.simulation.engine.MAX_ENTITIES_PER_RUN", 2)
    response = TestClient(app).post(RUN, json=example())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "failed_simulation"
    assert "generated entities" in response.json()["error"]["details"][0]["message"]


def test_internal_server_error_is_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(_model):
        raise RuntimeError("private implementation detail")

    monkeypatch.setattr("app.api.routes.simulations.simulate", fail)
    response = TestClient(app, raise_server_exceptions=False).post(RUN, json=example())
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_server_error", "message": "Internal server error", "details": []}
    }
    assert "private implementation detail" not in response.text


def test_validation_does_not_execute_simulation(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(_model):
        raise AssertionError("simulation should not run during validation")

    monkeypatch.setattr("app.api.routes.simulations.simulate", fail)
    assert TestClient(app).post(VALIDATE, json=deepcopy(example())).json() == {"valid": True, "errors": []}


def test_doctor_capacity_changes_measured_api_results() -> None:
    model = example()
    model["simulation"]["duration"] = 60
    model["nodes"][0]["config"].update(mean_interarrival_time=2, max_entities=30)
    model["nodes"][1]["name"] = "Doctor"
    model["nodes"][1]["config"].update(resource_count=1, mean_service_time=5)
    model["nodes"].insert(1, {
        "id": "doctor-queue", "type": "queue", "name": "Doctor queue",
        "position": {"x": 120, "y": 0}, "config": {"capacity": None, "discipline": "fifo"},
    })
    model["edges"] = [
        {"id": "e1", "source": "arrivals", "target": "doctor-queue"},
        {"id": "e2", "source": "doctor-queue", "target": "service"},
        {"id": "e3", "source": "service", "target": "exit"},
    ]
    client = TestClient(app)
    one = client.post(RUN, json=model)
    assert one.status_code == 200
    model["nodes"][2]["config"]["resource_count"] = 3
    three = client.post(RUN, json=model)
    assert three.status_code == 200
    before, after = one.json(), three.json()
    assert before["summary"]["average_waiting_time"] > after["summary"]["average_waiting_time"]
    assert before["summary"]["throughput"] < after["summary"]["throughput"]
    assert before["nodeMetrics"]["service"]["resource_utilization"] > after["nodeMetrics"]["service"]["resource_utilization"]
