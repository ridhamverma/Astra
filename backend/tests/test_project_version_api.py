"""Read-only model history must preserve snapshots and remain owner scoped."""
import json
from uuid import uuid4
import test_persistence
from app.schemas.simulation import SimulationModel

test_database = test_persistence.test_database


def test_versions_read_immutable_snapshots_without_exposing_other_projects(test_database):
    client = test_persistence.client_for(test_database)
    first = json.loads((test_persistence.EXAMPLES / "simple.json").read_text())
    response = client.post("/api/v1/projects", json={"name": "Version history", "model": first})
    assert response.status_code == 201
    project_id = response.json()["id"]
    second = json.loads(json.dumps(first))
    second["simulation"]["seed"] += 1
    assert client.put(f"/api/v1/projects/{project_id}", json={"model": second}).status_code == 200
    assert client.get(f"/api/v1/projects/{project_id}/versions").json() == [2, 1]
    assert client.get(f"/api/v1/projects/{project_id}/versions/1").json() == SimulationModel.model_validate(first).model_dump(mode="json")
    assert client.get(f"/api/v1/projects/{project_id}/versions/2").json() == SimulationModel.model_validate(second).model_dump(mode="json")
    assert client.get(f"/api/v1/projects/{project_id}/versions/999").status_code == 404
    outsider = test_persistence.client_for(test_database)
    assert outsider.get(f"/api/v1/projects/{project_id}/versions").status_code == 404
    assert outsider.get(f"/api/v1/projects/{project_id}/versions/1").status_code == 404
    assert client.get(f"/api/v1/projects/{uuid4()}/versions").status_code == 404
