import json
from pathlib import Path
from random import Random

import pytest

from app.schemas.simulation import SimulationModel
from app.simulation import SimulationLimitError, UnsupportedModelError, simulate
from app.simulation.distributions import sample_duration


EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"


def simple_model() -> dict:
    return json.loads((EXAMPLES / "simple.json").read_text())


def test_a_uncongested_constant_timing() -> None:
    # Arrivals at 0, 10, 20, 30, 40, 50; completions two minutes later.
    result = simulate(SimulationModel.model_validate(simple_model()))

    assert result.summary.total_generated == 6
    assert result.summary.total_completed == 6
    assert result.summary.in_system_at_end == 0
    assert result.summary.average_cycle_time == 2
    assert [entity.created_at for entity in result.entities] == [0, 10, 20, 30, 40, 50]
    assert [entity.completed_at for entity in result.entities] == [2, 12, 22, 32, 42, 52]
    assert all(entity.current_node == "exit" for entity in result.entities)
    assert result.node_metrics["service"].average_waiting_time == 0
    assert result.node_metrics["service"].services_completed == 6


def test_b_overloaded_server_builds_congestion() -> None:
    model = simple_model()
    model["nodes"][0]["config"]["mean_interarrival_time"] = 2
    del model["nodes"][0]["config"]["max_entities"]
    model["nodes"][1]["config"]["mean_service_time"] = 5

    result = simulate(model)

    assert result.summary.total_generated == 30
    assert result.summary.total_completed == 11
    assert result.summary.in_system_at_end == 19
    assert result.node_metrics["service"].services_started == 12
    assert result.node_metrics["service"].average_waiting_time == 16.5
    assert result.node_metrics["service"].maximum_waiting_time == 33
    assert [event.time for event in result.events if event.type == "service_completed"] == list(range(5, 60, 5))


def test_event_order_and_required_fields() -> None:
    result = simulate(simple_model())
    assert [event.time for event in result.events] == sorted(event.time for event in result.events)

    first = [event for event in result.events if event.entity_id == "entity-1"]
    assert [(event.time, event.type, event.node_id) for event in first] == [
        (0, "entity_created", "arrivals"),
        (0, "node_enter", "arrivals"),
        (0, "node_exit", "arrivals"),
        (0, "node_enter", "service"),
        (0, "service_requested", "service"),
        (0, "service_started", "service"),
        (2, "service_completed", "service"),
        (2, "node_exit", "service"),
        (2, "node_enter", "exit"),
        (2, "node_exit", "exit"),
        (2, "entity_completed", "exit"),
    ]
    assert all(set(event.model_dump()) == {"time", "type", "entity_id", "node_id"} for event in result.events)
    assert "nodeMetrics" in result.model_dump()


def test_seeded_runs_are_identical_and_different_seeds_change_draws() -> None:
    model = simple_model()
    model["nodes"][0]["config"].update({"distribution": "exponential", "mean_interarrival_time": 3})
    del model["nodes"][0]["config"]["max_entities"]
    model["nodes"][1]["config"].update({"service_distribution": "exponential", "mean_service_time": 2})

    first = simulate(model)
    second = simulate(model)
    assert first == second

    model["simulation"]["seed"] += 1
    third = simulate(model)
    assert [entity.created_at for entity in first.entities] != [entity.created_at for entity in third.entities]

    model["simulation"]["seed"] -= 1
    model["nodes"][1]["config"]["mean_service_time"] = 8
    slower_service = simulate(model)
    assert [entity.created_at for entity in first.entities] == [entity.created_at for entity in slower_service.entities]


def test_more_resources_reduce_waiting_under_same_arrivals() -> None:
    model = simple_model()
    model["nodes"][0]["config"]["mean_interarrival_time"] = 2
    del model["nodes"][0]["config"]["max_entities"]
    model["nodes"][1]["config"]["mean_service_time"] = 5
    one_server = simulate(model)

    model["nodes"][1]["config"]["resource_count"] = 3
    three_servers = simulate(model)
    assert three_servers.summary.total_generated == one_server.summary.total_generated
    assert three_servers.summary.total_completed > one_server.summary.total_completed
    assert three_servers.node_metrics["service"].average_waiting_time == 0


def test_horizon_is_exclusive_and_max_entities_is_respected() -> None:
    model = simple_model()
    model["simulation"]["duration"] = 10
    model["nodes"][1]["config"]["mean_service_time"] = 10
    result = simulate(model)
    assert result.summary.total_generated == 1
    assert result.summary.total_completed == 0
    assert all(event.time < 10 for event in result.events)

    model["simulation"]["duration"] = 60
    model["nodes"][0]["config"]["max_entities"] = 2
    assert simulate(model).summary.total_generated == 2


@pytest.mark.parametrize("name", ["bank", "hospital"])
def test_existing_complete_examples_execute(name: str) -> None:
    model = json.loads((EXAMPLES / f"{name}.json").read_text())
    result = simulate(model)
    assert result.summary.total_generated > 0
    assert result.summary.total_completed > 0
    assert result.summary.total_generated == (
        result.summary.total_completed + result.summary.total_rejected + result.summary.in_system_at_end
    )


def test_dead_end_fails_clearly() -> None:
    model = simple_model()
    model["edges"].pop()
    with pytest.raises(UnsupportedModelError, match="has no outgoing path"):
        simulate(model)


def test_distribution_utility_is_deterministic_and_bounded() -> None:
    assert sample_duration(Random(1), "constant", 4) == 4
    assert sample_duration(Random(7), "exponential", 4) == sample_duration(Random(7), "exponential", 4)
    draw = sample_duration(Random(2), "uniform", 4, 2, 6)
    assert 2 <= draw <= 6
    with pytest.raises(ValueError, match="requires minimum and maximum"):
        sample_duration(Random(1), "uniform", 4)


def test_entity_safety_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.simulation.engine.MAX_ENTITIES_PER_RUN", 3)
    model = simple_model()
    model["nodes"][0]["config"]["mean_interarrival_time"] = 1
    del model["nodes"][0]["config"]["max_entities"]
    with pytest.raises(SimulationLimitError, match="exceeded 3 generated entities"):
        simulate(model)
