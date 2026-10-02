"""Scenario persistence, snapshot isolation, and measured comparison correctness."""
from test_persistence import test_database as test_database
from copy import deepcopy

import pytest
from sqlalchemy import inspect

from test_persistence import client_for, simple_model
from app.simulation import simulate
from app.simulation.comparison import metric_difference


def doctor_model():
    from pathlib import Path
    import json
    return json.loads((Path(__file__).resolve().parents[2] / "docs/examples/doctor-capacity.json").read_text())


def create(client, name, model=None):
    model = model or doctor_model()
    project = client.post("/api/v1/projects", json={"name": name, "model": model}).json()
    response = client.post(f"/api/v1/projects/{project['id']}/scenarios", json={"name": "Baseline", "model": model})
    assert response.status_code == 201, response.text
    return project["id"], response.json()


def duplicate(client, scenario):
    response = client.post(f"/api/v1/scenarios/{scenario['id']}/duplicate", json={"name": "Scenario B"})
    assert response.status_code == 201, response.text
    return response.json()


def run(client, scenario):
    response = client.post(f"/api/v1/scenarios/{scenario['id']}/runs", json={"include_timeline": True})
    assert response.status_code == 201, response.text
    return response.json()


def compare(client, project, baseline, candidate):
    return client.post(f"/api/v1/projects/{project}/scenarios/compare", json={"baseline_id": baseline["id"], "scenario_id": candidate["id"]})


def test_scenario_workflow_and_restart(test_database):
    client = client_for(test_database)
    project, baseline = create(client, "Doctor experiment")
    baseline_run = run(client, baseline)
    candidate = duplicate(client, baseline)
    assert candidate["model"] == baseline["model"]
    assert candidate["latest_run"] is None
    changed = deepcopy(candidate["model"])
    doctor = next(node for node in changed["nodes"] if node["type"] == "process")
    doctor["config"]["resource_count"] = 3
    candidate = client.put(f"/api/v1/scenarios/{candidate['id']}", json={"model": changed}).json()
    assert candidate["model_version"] != baseline["model_version"]
    assert client.get(f"/api/v1/scenarios/{baseline['id']}").json()["model"] == baseline["model"]
    candidate_run = run(client, candidate)
    expected = simulate(changed)
    assert candidate_run["summary"] == expected.summary.model_dump(mode="json")
    assert candidate_run["events"] == [event.model_dump(mode="json") for event in expected.events]
    assert candidate_run["scenario_id"] == candidate["id"]
    response = compare(client, project, baseline, candidate)
    assert response.status_code == 200, response.text
    comparison = response.json()
    metrics = {metric["key"]: metric for metric in comparison["metrics"]}
    assert metrics["average_waiting_time"]["baseline"] == 15
    assert metrics["average_waiting_time"]["scenario"] == 0
    assert metrics["average_waiting_time"]["absolute_difference"] == -15
    assert metrics["average_waiting_time"]["percentage_difference"] == -100
    assert metrics["maximum_waiting_time"]["absolute_difference"] == -30
    assert metrics["throughput"]["baseline"] == 11
    assert metrics["throughput"]["scenario"] == 28
    assert metrics["throughput"]["percentage_difference"] == pytest.approx(17 / 11 * 100)
    assert metrics["completion_rate"]["absolute_difference"] == pytest.approx(17 / 30 * 100)
    assert metrics[f"utilization:{doctor['id']}"]["scenario"] == pytest.approx(146 / 180 * 100)
    assert comparison["duration"] == 60 and comparison["seed"] == 42
    restarted = client_for(test_database, previous=client)
    assert restarted.get(f"/api/v1/projects/{project}/scenarios").json()[0]["latest_run"]["id"] == baseline_run["id"]
    assert compare(restarted, project, baseline, candidate).json() == comparison
    renamed = restarted.put(f"/api/v1/scenarios/{candidate['id']}", json={"name": "Three doctors"}).json()
    assert renamed["name"] == "Three doctors"
    assert renamed["model_version"] == candidate["model_version"]
    assert renamed["latest_run"]["id"] == candidate_run["id"]
    unchanged = restarted.put(f"/api/v1/scenarios/{candidate['id']}", json={"model": changed}).json()
    assert unchanged["model_version"] == candidate["model_version"]
    assert restarted.delete(f"/api/v1/scenarios/{candidate['id']}").status_code == 204
    assert restarted.get(f"/api/v1/scenarios/{candidate['id']}").status_code == 404
    retained = restarted.get(f"/api/v1/runs/{candidate_run['id']}").json()
    assert retained["scenario_id"] is None
    assert retained["summary"] == candidate_run["summary"]
    assert len(restarted.get(f"/api/v1/projects/{project}/scenarios").json()) == 1
    assert "events" not in {column["name"] for column in inspect(test_database).get_columns("simulation_runs")}
    assert restarted.delete(f"/api/v1/projects/{project}").status_code == 204
    assert restarted.get(f"/api/v1/scenarios/{baseline['id']}").status_code == 404
    assert restarted.get(f"/api/v1/runs/{baseline_run['id']}").status_code == 404


@pytest.mark.parametrize("setting,value", [("seed", 43), ("duration", 61)])
def test_comparison_rejects_different_conditions_and_old_snapshot_runs(test_database, setting, value):
    client = client_for(test_database)
    project, baseline = create(client, "Controlled comparison")
    candidate = duplicate(client, baseline)
    assert compare(client, project, baseline, candidate).status_code == 409
    run(client, baseline)
    run(client, candidate)
    assert compare(client, project, baseline, candidate).status_code == 200
    changed = deepcopy(candidate["model"])
    changed["simulation"][setting] = value
    updated = client.put(f"/api/v1/scenarios/{candidate['id']}", json={"model": changed}).json()
    assert updated["latest_run"] is None
    assert compare(client, project, baseline, candidate).status_code == 409
    run(client, updated)
    response = compare(client, project, baseline, updated)
    assert response.status_code == 409
    assert "identical simulation duration and seed" in response.json()["error"]["message"]


def test_validation_and_project_isolation(test_database):
    client = client_for(test_database)
    project, baseline = create(client, "Project A", simple_model())
    other_project, other = create(client, "Project B", simple_model())
    assert compare(client, project, baseline, other).status_code == 404
    assert compare(client, project, baseline, baseline).status_code == 422
    assert client.put(f"/api/v1/scenarios/{baseline['id']}", json={"name": "   "}).status_code == 400
    assert client.put(f"/api/v1/scenarios/{baseline['id']}", json={"model": None}).status_code == 422
    invalid = deepcopy(baseline["model"])
    invalid["nodes"][1]["config"]["resource_count"] = 0
    assert client.put(f"/api/v1/scenarios/{baseline['id']}", json={"model": invalid}).status_code == 422
    assert client.get(f"/api/v1/scenarios/{baseline['id']}").json()["model"] == baseline["model"]
    assert client.post(f"/api/v1/scenarios/{baseline['id']}/runs", json={"model_version": 999}).status_code == 409
    assert client.delete(f"/api/v1/projects/{other_project}").status_code == 204
    assert client.get(f"/api/v1/scenarios/{other['id']}").status_code == 404


def test_difference_zero_unknown_and_missing_process():
    assert metric_difference("x", "X", "min", 0, 10).percentage_difference is None
    assert metric_difference("x", "X", "min", None, 10).absolute_difference is None
    assert metric_difference("x", "X", "min", 10, None).percentage_difference is None
    assert metric_difference("x", "X", "min", 10, 15).absolute_difference == 5
