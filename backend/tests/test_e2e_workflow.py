"""Phase 20: End-to-end deployed workflow verification.

Executes the complete 13-step lifecycle:
1. Register -> 2. Login -> 3. Create Project -> 4. Build Model -> 5. Save ->
6. Run Simulation -> 7. View Analytics -> 8. Replay -> 9. Create Scenario ->
10. Compare -> 11. AI Generate Model -> 12. Detect Bottleneck -> 13. Optimize.
"""
from copy import deepcopy
import json
from pathlib import Path
from uuid import uuid4

import pytest
from test_persistence import test_database, client_for


def load_model(name: str = "doctor-capacity.json") -> dict:
    file_path = Path(__file__).resolve().parents[2] / f"docs/examples/{name}"
    return json.loads(file_path.read_text())


def test_complete_deployed_workflow(test_database):
    client = client_for(test_database, authenticated=False)

    # --------------------------------------------------------------------------
    # Step 1: Register
    # --------------------------------------------------------------------------
    user_email = f"operator-{uuid4().hex[:8]}@astra.internal"
    user_password = "SuperSecretPassword123!"
    user_name = "Operations Lead"

    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": user_email, "password": user_password, "display_name": user_name},
    )
    assert reg_resp.status_code == 201, reg_resp.text
    reg_data = reg_resp.json()
    assert reg_data["user"]["email"] == user_email
    assert reg_data["user"]["display_name"] == user_name
    csrf_token = reg_data["csrf_token"]
    assert len(csrf_token) > 0

    # --------------------------------------------------------------------------
    # Step 2: Login
    # --------------------------------------------------------------------------
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": user_email, "password": user_password},
    )
    assert login_resp.status_code == 200, login_resp.text
    login_data = login_resp.json()
    assert login_data["user"]["id"] == reg_data["user"]["id"]
    csrf_token = login_data["csrf_token"]
    headers = {"X-Astra-CSRF": csrf_token}

    # Verify session via /api/v1/auth/me
    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["email"] == user_email

    # --------------------------------------------------------------------------
    # Step 3: Create Project
    # --------------------------------------------------------------------------
    initial_model = load_model("simple.json")
    proj_resp = client.post(
        "/api/v1/projects",
        json={"name": "Emergency Room Flow", "description": "Production capacity model", "model": initial_model},
        headers=headers,
    )
    assert proj_resp.status_code == 201, proj_resp.text
    project = proj_resp.json()
    project_id = project["id"]
    assert project["name"] == "Emergency Room Flow"
    assert project["latest_version"] == 1

    # --------------------------------------------------------------------------
    # Step 4: Build Model
    # --------------------------------------------------------------------------
    doctor_model = load_model("doctor-capacity.json")
    # Model contains: Source -> Queue -> Doctor Process -> Sink
    assert any(n["id"] == "doctor" for n in doctor_model["nodes"])

    # --------------------------------------------------------------------------
    # Step 5: Save Model to Project
    # --------------------------------------------------------------------------
    save_resp = client.put(
        f"/api/v1/projects/{project_id}",
        json={"model": doctor_model, "description": "Updated with Doctor Process node"},
        headers=headers,
    )
    assert save_resp.status_code == 200, save_resp.text
    saved_project = save_resp.json()
    assert saved_project["latest_version"] == 2

    saved_node_ids = [n["id"] for n in saved_project["model"]["nodes"]]
    expected_node_ids = [n["id"] for n in doctor_model["nodes"]]
    assert saved_node_ids == expected_node_ids

    # --------------------------------------------------------------------------
    # Step 6: Run Simulation
    # --------------------------------------------------------------------------
    run_resp = client.post(
        f"/api/v1/projects/{project_id}/runs",
        json={},
        headers=headers,
    )
    assert run_resp.status_code == 201, run_resp.text
    run_record = run_resp.json()
    run_id = run_record["id"]
    assert run_record["project_id"] == project_id

    # --------------------------------------------------------------------------
    # Step 7: View Analytics
    # --------------------------------------------------------------------------
    get_run_resp = client.get(f"/api/v1/runs/{run_id}")
    assert get_run_resp.status_code == 200, get_run_resp.text
    analytics = get_run_resp.json()
    summary = analytics["summary"]
    assert summary["throughput"] > 0
    assert "average_waiting_time" in summary
    assert "total_completed" in summary
    assert "node_metrics" in analytics
    assert "doctor" in analytics["node_metrics"]
    assert "resource_utilization" in analytics["node_metrics"]["doctor"]


    # --------------------------------------------------------------------------
    # Step 8: Replay
    # --------------------------------------------------------------------------
    sim_run_resp = client.post(
        "/api/v1/simulations/run",
        json=doctor_model,
        headers=headers,
    )
    assert sim_run_resp.status_code == 200, sim_run_resp.text
    sim_result = sim_run_resp.json()
    assert "events" in sim_result
    assert len(sim_result["events"]) > 0
    # Replay requires chronological non-decreasing event log
    times = [e["time"] for e in sim_result["events"]]
    assert times == sorted(times)

    # --------------------------------------------------------------------------
    # Step 9: Create Scenario
    # --------------------------------------------------------------------------
    scenario_a_resp = client.post(
        f"/api/v1/projects/{project_id}/scenarios",
        json={"name": "Baseline (1 Doctor)", "model": doctor_model},
        headers=headers,
    )
    assert scenario_a_resp.status_code == 201, scenario_a_resp.text
    scenario_a = scenario_a_resp.json()

    # Create Scenario B with increased resource count (3 Doctors)
    expanded_model = deepcopy(doctor_model)
    doctor_node = next(n for n in expanded_model["nodes"] if n["id"] == "doctor")
    doctor_node["config"]["resource_count"] = 3

    scenario_b_resp = client.post(
        f"/api/v1/projects/{project_id}/scenarios",
        json={"name": "Capacity Expansion (3 Doctors)", "model": expanded_model},
        headers=headers,
    )
    assert scenario_b_resp.status_code == 201, scenario_b_resp.text
    scenario_b = scenario_b_resp.json()

    # Run both scenarios
    client.post(f"/api/v1/scenarios/{scenario_a['id']}/runs", json={}, headers=headers)
    client.post(f"/api/v1/scenarios/{scenario_b['id']}/runs", json={}, headers=headers)

    # --------------------------------------------------------------------------
    # Step 10: Compare Scenarios
    # --------------------------------------------------------------------------
    compare_resp = client.post(
        f"/api/v1/projects/{project_id}/scenarios/compare",
        json={"baseline_id": scenario_a["id"], "scenario_id": scenario_b["id"]},
        headers=headers,
    )
    assert compare_resp.status_code == 200, compare_resp.text
    comparison = compare_resp.json()
    assert comparison["baseline"]["id"] == scenario_a["id"]
    assert comparison["scenario"]["id"] == scenario_b["id"]
    assert "metrics" in comparison
    metrics_by_key = {m["key"]: m for m in comparison["metrics"]}
    # Throughput increased
    assert metrics_by_key["throughput"]["absolute_difference"] > 0
    # Waiting time decreased
    assert metrics_by_key["average_waiting_time"]["absolute_difference"] < 0


    # --------------------------------------------------------------------------
    # Step 11: AI Generate Model
    # --------------------------------------------------------------------------
    # When Gemini API key is configured or mocked
    ai_resp = client.post(
        "/api/v1/ai/generate-model",
        json={"prompt": "Create a customer checkout queue with cashiers"},
        headers=headers,
    )
    # Status is 200 if key present or handled controlled problem if upstream rate limits
    assert ai_resp.status_code in {200, 502, 503, 504}
    if ai_resp.status_code == 200:
        ai_data = ai_resp.json()
        assert "nodes" in ai_data["model"]
        assert len(ai_data["model"]["nodes"]) >= 2

    # --------------------------------------------------------------------------
    # Step 12: Detect Bottleneck
    # --------------------------------------------------------------------------
    assert "bottleneck_analysis" in analytics
    bottlenecks = analytics["bottleneck_analysis"]
    # In doctor_model with 1 doctor, doctor is the primary bottleneck
    assert bottlenecks["status"] == "detected"
    assert bottlenecks["primaryBottleneck"] == "doctor"

    assert len(bottlenecks["ranked"]) > 0
    assert bottlenecks["ranked"][0]["node_id"] == "doctor"

    # --------------------------------------------------------------------------
    # Step 13: Optimize
    # --------------------------------------------------------------------------
    opt_body = {
        "base_model": doctor_model,
        "variable_node": "doctor",
        "variable_parameter": "resource_count",
        "min": 1,
        "max": 3,
        "step": 1,
        "objective_metric": "average_waiting_time",
        "operator": "<=",
        "target": 15,
        "replications": 3,
        "max_additional_resources": 2,
    }
    opt_resp = client.post(
        "/api/v1/optimize",
        json=opt_body,
        headers=headers,
    )
    assert opt_resp.status_code == 200, opt_resp.text
    opt_result = opt_resp.json()
    assert opt_result["recommended"]["configuration"]["value"] in {2, 3}
    assert opt_result["simulation_runs"] == 9
    assert len(opt_result["tested_candidates"]) == 3
