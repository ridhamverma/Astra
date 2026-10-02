"""Manually calculable evidence, attribution, and deterministic rankings."""
from test_persistence import test_database as test_database
from copy import deepcopy
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.simulation import SimulationModel
from app.simulation import analyze_bottlenecks, simulate
from app.simulation.results import ProcessMetrics, QueueMetrics
from test_persistence import client_for

EXAMPLES = Path(__file__).resolve().parents[2] / "docs/examples"


def example(name="doctor-capacity"):
    return json.loads((EXAMPLES / f"{name}.json").read_text())


def process_metrics(utilization=0.9, wait=10.0, service=10.0, resources=1):
    return ProcessMetrics(resource_count=resources, services_started=10, entities_processed=10,
                          total_busy_resource_time=90, resource_utilization=utilization,
                          average_service_time=service, average_waiting_time=wait, maximum_waiting_time=wait * 2 if wait is not None else None)


def queue_metrics(mean=1.0, peak=3, arrivals=10, rejected=0):
    return QueueMetrics(total_arrivals=arrivals, total_exited=arrivals-rejected,
                        rejected_entities=rejected, average_waiting_time=10, maximum_waiting_time=20,
                        average_queue_length=mean, maximum_queue_length=peak, waiting_at_end=1)


def test_manually_calculated_score_without_double_counting():
    model = SimulationModel.model_validate(example())
    metrics = {"doctor": process_metrics(), "doctor-queue": queue_metrics()}
    analysis = analyze_bottlenecks(model, metrics)
    primary = analysis.ranked[0]
    assert analysis.primary_bottleneck == "doctor"
    assert primary.evidence.normalized_waiting == 0.5  # 10 / (10 + 10)
    assert primary.evidence.normalized_queue == 0.5  # 1 / (1 + 1)
    assert primary.evidence.congestion_pressure == 0.5  # max, never sum
    assert primary.score == pytest.approx(0.45)  # 0.9 * 0.5
    assert primary.evidence.average_waiting_time == 10  # Queue wait not added again
    assert primary.evidence.maximum_waiting_time == 20
    assert primary.evidence.upstream_queues[0].node_id == "doctor-queue"
    assert "90.00%" in primary.reasons[0]


def test_real_doctor_congestion_disappears_with_three_resources():
    model = example()
    baseline = simulate(model)
    assert baseline.bottleneck_analysis.primary_bottleneck == "doctor"
    assert baseline.bottleneck_analysis.score == pytest.approx(0.9)  # time-weighted Q=9, R=1
    assert baseline.bottleneck_analysis.ranked[0].evidence.average_queue_length == 9
    model["nodes"][2]["config"]["resource_count"] = 3
    improved = simulate(model)
    assert improved.bottleneck_analysis.status == "no_congestion"
    assert improved.bottleneck_analysis.primary_bottleneck is None
    assert improved.bottleneck_analysis.score == 0
    # Capacity is still busy, but this alone must not imply congestion.
    assert improved.node_metrics["doctor"].resource_utilization > 0.8


def test_finite_queue_rejection_is_evidence_even_without_waiting_space():
    model = example()
    model["nodes"][1]["config"]["capacity"] = 0
    result = simulate(model)
    ranked = result.bottleneck_analysis.ranked[0]
    assert result.summary.total_rejected > 0
    assert ranked.evidence.average_queue_length == 0
    assert ranked.evidence.average_waiting_time == 0
    assert ranked.evidence.rejection_fraction == result.summary.total_rejected / 30
    assert ranked.score > 0
    assert result.bottleneck_analysis.primary_bottleneck == "doctor"


def test_unfinished_services_and_waits_use_measured_backlog():
    model = example()
    model["simulation"]["duration"] = 3
    model["nodes"][0]["config"]["mean_interarrival_time"] = 1
    model["nodes"][2]["config"]["mean_service_time"] = 100
    result = simulate(model)
    ranked = result.bottleneck_analysis.ranked[0]
    assert ranked.evidence.average_waiting_time == 0  # only first entity started service
    assert ranked.evidence.service_time_basis == "configured"
    assert ranked.evidence.reference_service_time == 100
    assert ranked.evidence.waiting_at_end == 2
    assert ranked.evidence.average_queue_length == pytest.approx(1)
    assert ranked.score == pytest.approx(0.5)


def test_direct_process_waits_need_no_explicit_queue():
    model = example("simple")
    model["simulation"]["duration"] = 60
    model["nodes"][0]["config"].update(mean_interarrival_time=2, max_entities=30)
    model["nodes"][1]["config"]["mean_service_time"] = 5
    result = simulate(model)
    ranked = result.bottleneck_analysis.ranked[0]
    assert result.bottleneck_analysis.primary_bottleneck == "service"
    assert ranked.evidence.average_queue_length is None
    assert ranked.evidence.average_waiting_time == 16.5
    assert ranked.score == pytest.approx(16.5 / (16.5 + 5))


def test_no_process_missing_metrics_and_idle_stages():
    model = example("simple")
    source, _, sink = model["nodes"]
    model["nodes"] = [source, sink]
    model["edges"] = [{"id":"e", "source":source["id"], "target":sink["id"]}]
    assert simulate(model).bottleneck_analysis.status == "not_applicable"
    doctor = SimulationModel.model_validate(example())
    assert analyze_bottlenecks(doctor, {}).status == "insufficient_data"
    missing_queue = analyze_bottlenecks(doctor, {"doctor": process_metrics(utilization=0, wait=None, service=None)})
    assert missing_queue.status == "insufficient_data"
    assert missing_queue.ranked[0].evidence.average_queue_length is None
    assert missing_queue.ranked[0].evidence.average_waiting_time is None
    idle = analyze_bottlenecks(doctor, {"doctor": process_metrics(utilization=0, wait=0), "doctor-queue": queue_metrics(mean=0, peak=0)})
    assert idle.primary_bottleneck is None and idle.score == 0


def two_process_model():
    model = example()
    other = deepcopy(model["nodes"][2])
    other.update(id="a-process", name="Other process")
    model["nodes"].insert(3, other)
    model["edges"][-1]["target"] = other["id"]
    model["edges"].append({"id":"other-exit", "source":other["id"], "target":"exit"})
    return model


def test_attribution_stops_at_processes_and_delays():
    raw = two_process_model()
    model = SimulationModel.model_validate(raw)
    metrics = {"doctor": process_metrics(utilization=0.9, wait=0), "a-process": process_metrics(utilization=1, wait=0), "doctor-queue": queue_metrics(mean=9)}
    analysis = analyze_bottlenecks(model, metrics)
    assert analysis.primary_bottleneck == "doctor"  # queue must not leak to downstream Process
    other = next(item for item in analysis.ranked if item.node_id == "a-process")
    assert other.evidence.upstream_queues == [] and other.score == 0
    # A Delay breaks the resource-wait link; arbitrary ancestors are not blamed.
    raw["nodes"].insert(2, {"id":"delay", "name":"Transit", "type":"delay", "position":{"x":0,"y":0}, "config":{"distribution":"constant","mean_delay":1}})
    raw["edges"][1]["target"] = "delay"
    raw["edges"].append({"id":"delay-doctor", "source":"delay", "target":"doctor"})
    separated = analyze_bottlenecks(SimulationModel.model_validate(raw), metrics)
    assert separated.primary_bottleneck is None
    assert all(not item.evidence.upstream_queues for item in separated.ranked)


def test_deterministic_ties_input_order_and_stable_normalization():
    raw = two_process_model()
    metrics = {"doctor": process_metrics(), "a-process": process_metrics(), "doctor-queue": queue_metrics(mean=0)}
    before = deepcopy(metrics)
    first = analyze_bottlenecks(SimulationModel.model_validate(raw), metrics)
    assert first.primary_bottleneck == "a-process"  # exact score/util/wait tie: ID
    assert first.score == pytest.approx(0.45)
    raw["nodes"].reverse(); raw["edges"].reverse()
    assert analyze_bottlenecks(SimulationModel.model_validate(raw), dict(reversed(list(metrics.items())))) == first
    assert metrics == before
    raw["simulation"]["seed"] += 7
    assert analyze_bottlenecks(SimulationModel.model_validate(raw), metrics) == first
    # Score is not affected by choice of time units when both durations scale.
    scaled = {key: value.model_copy(update={"average_waiting_time": value.average_waiting_time*60, "maximum_waiting_time": value.maximum_waiting_time*60, "average_service_time": value.average_service_time*60}) if isinstance(value, ProcessMetrics) else value for key,value in metrics.items()}
    assert analyze_bottlenecks(SimulationModel.model_validate(raw), scaled).score == first.score
    # Peak outliers alone never change sustained ranking.
    peaked = {**metrics, "doctor-queue": queue_metrics(mean=0, peak=100000)}
    assert analyze_bottlenecks(SimulationModel.model_validate(raw), peaked).score == first.score


def test_multiple_feeding_queues_sum_averages_not_individual_peaks():
    raw = example()
    second_source = deepcopy(raw["nodes"][0]); second_source["id"] = "second-source"
    second_queue = deepcopy(raw["nodes"][1]); second_queue["id"] = "second-queue"
    raw["nodes"].extend([second_source, second_queue])
    raw["edges"].extend([{"id":"s2-q2", "source":"second-source", "target":"second-queue"}, {"id":"q2-p", "source":"second-queue", "target":"doctor"}])
    analysis = analyze_bottlenecks(SimulationModel.model_validate(raw), {
        "doctor": process_metrics(wait=0), "doctor-queue": queue_metrics(mean=2, peak=5), "second-queue": queue_metrics(mean=3, peak=7),
    })
    evidence = analysis.ranked[0].evidence
    assert evidence.average_queue_length == 5
    assert evidence.maximum_queue_length == 7  # Not a fabricated simultaneous peak of 12.
    assert evidence.normalized_queue == pytest.approx(5/6)


def test_api_and_saved_history_use_exact_run_snapshot_without_rerun(test_database, monkeypatch):
    raw = example()
    direct = simulate(raw).bottleneck_analysis.model_dump(mode="json")
    response = TestClient(app).post("/api/v1/simulations/run", json=raw)
    assert response.status_code == 200
    assert response.json()["bottleneckAnalysis"] == direct
    client = client_for(test_database)
    project = client.post("/api/v1/projects", json={"name":"Bottleneck snapshot", "model":raw}).json()
    created = client.post(f"/api/v1/projects/{project['id']}/runs", json={}).json()
    assert created["bottleneck_analysis"] == direct
    changed = deepcopy(raw)
    changed["nodes"][2]["name"] = "Renamed current Doctor"
    changed["nodes"][2]["config"]["resource_count"] = 3
    client.put(f"/api/v1/projects/{project['id']}", json={"model":changed})
    def fail(_model):
        raise AssertionError("Reading analysis must not rerun simulation")
    monkeypatch.setattr("app.api.routes.projects.simulate", fail)
    restarted = client_for(test_database, previous=client)
    stored = restarted.get(f"/api/v1/runs/{created['id']}")
    assert stored.status_code == 200
    assert stored.json()["bottleneck_analysis"] == direct
    assert stored.json()["bottleneck_analysis"]["ranked"][0]["name"] == "Doctor"
    assert restarted.get(f"/api/v1/projects/{project['id']}/runs").json()[0]["bottleneck_analysis"] == direct
