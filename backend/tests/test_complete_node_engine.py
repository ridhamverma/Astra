import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.simulation import CyclicModelError, simulate


EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"


def load_example(name: str) -> dict:
    return json.loads((EXAMPLES / f"{name}.json").read_text())


def queue_model(capacity: int | None, *, resources: int = 1) -> dict:
    model = load_example("simple")
    model["simulation"]["duration"] = 20
    source = model["nodes"][0]
    source["config"].update({"mean_interarrival_time": 1, "max_entities": 5})
    process = model["nodes"][1]
    process["config"].update({"mean_service_time": 5, "resource_count": resources})
    queue = {
        "id": "line",
        "type": "queue",
        "name": "Waiting Line",
        "position": {"x": 120, "y": 0},
        "config": {"capacity": capacity, "discipline": "fifo"},
    }
    model["nodes"].insert(1, queue)
    model["edges"] = [
        {"id": "e-source-queue", "source": "arrivals", "target": "line"},
        {"id": "e-queue-process", "source": "line", "target": "service"},
        {"id": "e-process-sink", "source": "service", "target": "exit"},
    ]
    return model


def decision_model() -> dict:
    model = load_example("simple")
    source, _, sink = model["nodes"]
    source["config"].update({"mean_interarrival_time": 1, "max_entities": 20})
    model["simulation"]["duration"] = 30
    model["nodes"] = [
        source,
        {"id": "route", "type": "decision", "name": "Route", "position": {"x": 120, "y": 0}, "config": {"routing": "probability"}},
        {"id": "short", "type": "delay", "name": "Short Delay", "position": {"x": 240, "y": -80}, "config": {"distribution": "constant", "mean_delay": 1}},
        {"id": "long", "type": "delay", "name": "Long Delay", "position": {"x": 240, "y": 80}, "config": {"distribution": "constant", "mean_delay": 2}},
        sink,
    ]
    model["edges"] = [
        {"id": "e-source-route", "source": "arrivals", "target": "route"},
        {"id": "e-route-short", "source": "route", "target": "short", "probability": 0.7},
        {"id": "e-route-long", "source": "route", "target": "long", "probability": 0.3},
        {"id": "e-short-sink", "source": "short", "target": "exit"},
        {"id": "e-long-sink", "source": "long", "target": "exit"},
    ]
    return model


def test_unlimited_queue_is_fifo() -> None:
    model = queue_model(None)
    model["nodes"][0]["config"]["max_entities"] = 4
    result = simulate(model)

    starts = [event for event in result.events if event.type == "service_started"]
    assert [event.entity_id for event in starts] == ["entity-1", "entity-2", "entity-3", "entity-4"]
    assert [event.time for event in starts] == [0, 5, 10, 15]
    exits = [event for event in result.events if event.type == "queue_exit"]
    assert [event.entity_id for event in exits] == [event.entity_id for event in starts]
    assert result.node_metrics["line"].maximum_length == 3
    assert result.node_metrics["line"].rejected == 0
    assert result.node_metrics["line"].average_waiting_time == 6


def test_finite_queue_rejects_when_waiting_space_is_full() -> None:
    result = simulate(queue_model(1))
    rejected = [entity for entity in result.entities if entity.status == "rejected"]

    assert [entity.id for entity in rejected] == ["entity-3", "entity-4", "entity-5"]
    assert [entity.rejected_at for entity in rejected] == [2, 3, 4]
    assert result.summary.total_generated == 5
    assert result.summary.total_completed == 2
    assert result.summary.total_rejected == 3
    assert result.summary.in_system_at_end == 0
    assert result.node_metrics["line"].maximum_length == 1
    assert result.node_metrics["line"].entered == 5
    assert result.node_metrics["line"].exited == 2
    assert [event.entity_id for event in result.events if event.type == "queue_rejected"] == [entity.id for entity in rejected]
    assert not any(event.type == "entity_completed" and event.entity_id in {entity.id for entity in rejected} for event in result.events)


def test_zero_capacity_queue_allows_immediate_service_only() -> None:
    result = simulate(queue_model(0))
    assert result.summary.total_completed == 1
    assert result.summary.total_rejected == 4
    assert result.node_metrics["line"].maximum_length == 0


def test_parallel_process_resources_and_busy_time() -> None:
    model = load_example("simple")
    model["simulation"]["duration"] = 10
    model["nodes"][0]["config"].update({"mean_interarrival_time": 1, "max_entities": 6})
    model["nodes"][1]["config"].update({"resource_count": 3, "mean_service_time": 5})
    result = simulate(model)

    starts = [event for event in result.events if event.type == "service_started"]
    assert [event.time for event in starts] == [0, 1, 2, 5, 6, 7]
    assert result.node_metrics["service"].resource_count == 3
    assert result.node_metrics["service"].services_started == 6
    assert result.node_metrics["service"].services_completed == 3
    assert result.node_metrics["service"].total_busy_resource_time == 27
    assert result.node_metrics["service"].total_busy_resource_time <= 3 * model["simulation"]["duration"]


def test_seeded_probability_routing_uses_both_branches() -> None:
    model = decision_model()
    first = simulate(model)
    assert first == simulate(model)

    short_visits = [event for event in first.events if event.type == "node_enter" and event.node_id == "short"]
    long_visits = [event for event in first.events if event.type == "node_enter" and event.node_id == "long"]
    assert len(short_visits) + len(long_visits) == 20
    assert short_visits and long_visits
    assert first.summary.total_completed == 20

    deterministic = deepcopy(model)
    deterministic["edges"][1]["probability"] = 1
    deterministic["edges"][2]["probability"] = 0
    result = simulate(deterministic)
    assert not any(event.node_id == "long" for event in result.events)


def test_delay_holds_entity_without_process_resource() -> None:
    model = decision_model()
    model["nodes"] = [node for node in model["nodes"] if node["id"] in {"arrivals", "short", "exit"}]
    model["edges"] = [
        {"id": "e-source-delay", "source": "arrivals", "target": "short"},
        {"id": "e-delay-sink", "source": "short", "target": "exit"},
    ]
    model["nodes"][0]["config"].update({"mean_interarrival_time": 10, "max_entities": 2})
    model["nodes"][1]["config"]["mean_delay"] = 3
    result = simulate(model)
    assert [entity.completed_at for entity in result.entities] == [3, 13]
    assert result.node_metrics == {}
    first_delay_events = [(event.time, event.type) for event in result.events if event.entity_id == "entity-1" and event.node_id == "short"]
    assert first_delay_events == [(0, "node_enter"), (3, "node_exit")]


def test_hospital_complete_six_node_workflow() -> None:
    model = load_example("hospital")
    result = simulate(model)
    assert result == simulate(model)
    assert result.summary.total_generated == 99
    assert result.summary.total_completed == 95
    assert result.summary.total_rejected == 0
    entered_nodes = {event.node_id for event in result.events if event.type == "node_enter"}
    assert {"patients", "registration", "doctor-wait", "doctor", "next-step", "paperwork", "pharmacy-wait", "pharmacy", "discharge"} <= entered_nodes
    assert any(event.type == "queue_exit" for event in result.events)
    assert any(event.type == "service_completed" and event.node_id == "pharmacy" for event in result.events)


def test_two_sources_join_one_process() -> None:
    model = load_example("simple")
    second_source = deepcopy(model["nodes"][0])
    second_source["id"] = "arrivals-2"
    second_source["name"] = "Second Source"
    second_source["position"]["y"] = 100
    model["nodes"].append(second_source)
    model["edges"].append({"id": "e-second-source-service", "source": "arrivals-2", "target": "service"})

    result = simulate(model)
    assert result.summary.total_generated == 12
    assert result.summary.total_completed == 12
    assert result.node_metrics["service"].services_completed == 12


def test_cycles_are_rejected_before_run() -> None:
    model = load_example("hospital")
    next(edge for edge in model["edges"] if edge["id"] == "e-pharmacy-discharge")["target"] = "next-step"
    with pytest.raises(CyclicModelError, match="cycle detected"):
        simulate(model)
