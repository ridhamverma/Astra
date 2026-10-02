"""Every starter is a canonical graph executed by the normal simulator."""
from test_persistence import test_database as test_database
from math import isclose
import pytest
from app.templates import get_template, instantiate_template, list_templates
from app.schemas.simulation import SimulationModel
from app.simulation import simulate
from app.simulation.results import ProcessMetrics
from test_persistence import client_for

IDS = ["hospital", "bank", "restaurant", "warehouse", "customer-service"]

@pytest.mark.parametrize("template_id", IDS)
def test_template_executes_reproducibly_with_event_derived_metrics(template_id):
    starter = get_template(template_id)
    canonical = SimulationModel.model_validate(starter.model.model_dump(mode="json"))
    result = simulate(canonical)
    assert result.model_dump() == simulate(canonical).model_dump()
    created = [event for event in result.events if event.type == "entity_created"]
    completed = [event for event in result.events if event.type == "entity_completed"]
    assert result.summary.total_generated == len(created) > 0
    assert result.summary.total_completed == len(completed) > 0
    assert result.summary.total_completed + result.summary.total_rejected + result.summary.in_system_at_end == len(created)
    assert isclose(result.summary.throughput, len(completed) * 60 / canonical.simulation.duration)
    assert result.summary.average_cycle_time > 0
    assert result.summary.average_waiting_time >= 0
    for metrics in result.node_metrics.values():
        if isinstance(metrics, ProcessMetrics):
            assert 0 <= metrics.resource_utilization <= 1
            assert isclose(metrics.resource_utilization, metrics.total_busy_resource_time / (metrics.resource_count * canonical.simulation.duration))


def test_instances_are_independent_and_catalogue_cannot_be_edited_by_consumers():
    assert [item.id for item in list_templates()] == IDS
    first, second = instantiate_template("bank"), instantiate_template("bank", "My Bank")
    assert first.id != second.id and first.id != get_template("bank").model.id
    first.nodes[2].config.resource_count = 99
    first.nodes[0].position.x = 10000
    assert second.nodes[2].config.resource_count == 2
    assert get_template("bank").model.nodes[2].config.resource_count == 2
    assert get_template("bank").model.nodes[0].position.x == 0
    assert second.name == "My Bank"
    with pytest.raises(KeyError): get_template("../hospital")

@pytest.mark.parametrize("template_id", IDS)
def test_template_creates_normal_owned_editable_project_and_saved_run(test_database, template_id):
    client = client_for(test_database)
    response = client.post(f"/api/v1/templates/{template_id}/projects", json={"name": "My starter"})
    assert response.status_code == 201, response.text
    project = response.json()
    assert project["name"] == "My starter" and project["latest_version"] == 1
    assert project["model"]["name"] == "My starter"
    assert project["user_id"] == client.get("/api/v1/auth/me").json()["user"]["id"]
    assert client.get(f"/api/v1/projects/{project['id']}").json() == project
    assert client.get(f"/api/v1/projects/{project['id']}/runs").json() == []  # No automatic run.
    measured = client.post(f"/api/v1/projects/{project['id']}/runs", json={"include_timeline":True})
    assert measured.status_code == 201, measured.text
    assert measured.json()["summary"] == simulate(project["model"]).summary.model_dump(mode="json")
    edited = project["model"]
    process = next(node for node in edited["nodes"] if node["type"] == "process")
    process["config"]["resource_count"] += 1
    updated = client.put(f"/api/v1/projects/{project['id']}", json={"model": edited})
    assert updated.status_code == 200 and updated.json()["latest_version"] == 2
    restarted = client_for(test_database, previous=client)
    assert restarted.get(f"/api/v1/projects/{project['id']}").json()["model"] == updated.json()["model"]
    rerun = restarted.post(f"/api/v1/projects/{project['id']}/runs", json={})
    assert rerun.json()["summary"] == simulate(edited).summary.model_dump(mode="json")
    assert client.get(f"/api/v1/runs/{measured.json()['id']}").json()["model_version"] == 1
    assert get_template(template_id).model.nodes == SimulationModel.model_validate(response.json()["model"]).nodes


def test_catalogue_errors_blank_project_and_isolation(test_database):
    anonymous = client_for(test_database, authenticated=False)
    assert anonymous.get("/api/v1/templates").status_code == 401
    assert anonymous.post("/api/v1/templates/bank/projects", json={}).status_code == 401
    client = client_for(test_database)
    catalogue = client.get("/api/v1/templates")
    assert catalogue.status_code == 200 and [item["id"] for item in catalogue.json()] == IDS
    assert client.post("/api/v1/templates/unknown/projects", json={}).status_code == 404
    assert client.post("/api/v1/templates/bank/projects", json={"name":"   "}).status_code == 400
    assert client.post("/api/v1/templates/bank/projects", json={"user_id":"fake"}).status_code == 400
    first = client.post("/api/v1/templates/bank/projects", json={}).json()
    second = client.post("/api/v1/templates/bank/projects", json={}).json()
    assert first["id"] != second["id"] and first["model"]["id"] != second["model"]["id"]
    other = client_for(test_database)
    assert other.get(f"/api/v1/projects/{first['id']}").status_code == 404
    assert other.get("/api/v1/projects").json() == []
    blank = client.post("/api/v1/projects", json={"name":"Untitled project"}).json()
    assert blank["model"] is None and blank["latest_version"] is None
