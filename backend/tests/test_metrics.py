import json
from pathlib import Path

import pytest

from scripts.export_result_schema import schema_text
from app.schemas.simulation import SimulationModel
from app.simulation import simulate
from app.simulation.metrics import build_result
from app.simulation.results import ProcessMetrics, QueueMetrics, SimulationResult


EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"


def simple_model() -> dict:
    return json.loads((EXAMPLES / "simple.json").read_text())


def queue_model(capacity: int | None, max_entities: int = 4) -> dict:
    model = simple_model()
    model["simulation"]["duration"] = 20
    model["nodes"][0]["config"].update({"mean_interarrival_time": 1, "max_entities": max_entities})
    model["nodes"][1]["config"]["mean_service_time"] = 5
    model["nodes"].insert(
        1,
        {
            "id": "line",
            "type": "queue",
            "name": "Line",
            "position": {"x": 120, "y": 0},
            "config": {"capacity": capacity, "discipline": "fifo"},
        },
    )
    model["edges"] = [
        {"id": "e-source-line", "source": "arrivals", "target": "line"},
        {"id": "e-line-service", "source": "line", "target": "service"},
        {"id": "e-service-exit", "source": "service", "target": "exit"},
    ]
    return model


def test_simple_system_and_process_metrics_match_manual_calculation() -> None:
    result = simulate(simple_model())
    summary = result.summary
    process = result.node_metrics["service"]
    assert isinstance(process, ProcessMetrics)

    # Six two-minute services over a 60-minute horizon: 12 / (1 * 60) = 0.2.
    assert summary.total_generated == 6
    assert summary.total_completed == 6
    assert summary.total_rejected == 0
    assert summary.completion_rate == 1
    assert summary.average_cycle_time == 2
    assert summary.maximum_cycle_time == 2
    assert summary.average_waiting_time == 0
    assert summary.maximum_waiting_time == 0
    assert summary.throughput_per_hour == 6
    assert summary.throughput == 6
    assert process.entities_processed == 6
    assert process.average_service_time == 2
    assert process.total_busy_resource_time == 12
    assert process.resource_utilization == pytest.approx(0.2)
    assert [(point.time, point.value) for point in result.time_series.cumulative_completed] == [
        (0, 0), (2, 1), (12, 2), (22, 3), (32, 4), (42, 5), (52, 6), (60, 6)
    ]


def test_congestion_cycle_time_throughput_and_censored_service() -> None:
    model = simple_model()
    model["nodes"][0]["config"]["mean_interarrival_time"] = 2
    del model["nodes"][0]["config"]["max_entities"]
    model["nodes"][1]["config"]["mean_service_time"] = 5
    result = simulate(model)
    process = result.node_metrics["service"]
    assert isinstance(process, ProcessMetrics)

    # Completion times are 5, 10, ..., 55. Their cycle times are 5, 8, ..., 35.
    assert result.summary.total_generated == 30
    assert result.summary.total_completed == 11
    assert result.summary.completion_rate == pytest.approx(11 / 30)
    assert result.summary.average_cycle_time == 20
    assert result.summary.maximum_cycle_time == 35
    # Completed entities waited 0, 3, ..., 30 minutes for the one resource.
    assert result.summary.average_waiting_time == 15
    assert result.summary.maximum_waiting_time == 30
    assert result.summary.throughput_per_hour == 11
    assert process.average_waiting_time == 16.5
    assert process.average_service_time == 5
    assert process.entities_processed == 11
    assert process.services_started == 12
    assert process.total_busy_resource_time == 60
    assert process.resource_utilization == 1


def test_time_weighted_queue_length_and_waiting_time() -> None:
    result = simulate(queue_model(None))
    queue = result.node_metrics["line"]
    assert isinstance(queue, QueueMetrics)

    # Four arrivals at 0,1,2,3. Waiting lengths: 1 for [1,2), 2 for [2,3),
    # 3 for [3,5), 2 for [5,10), 1 for [10,15). Area = 1+2+6+10+5 = 24.
    assert queue.total_arrivals == 4
    assert queue.total_exited == 4
    assert queue.rejected_entities == 0
    assert queue.average_waiting_time == 6  # waits are 0, 4, 8, 12
    assert queue.maximum_waiting_time == 12
    assert queue.average_queue_length == pytest.approx(24 / 20)
    assert queue.maximum_queue_length == 3
    assert queue.waiting_at_end == 0
    assert [(point.time, point.value) for point in result.time_series.queue_lengths["line"]] == [
        (0, 0), (1, 1), (2, 2), (3, 3), (5, 2), (10, 1), (15, 0), (20, 0)
    ]
    assert result.summary.average_cycle_time == 9  # completed cycles: 5, 9, 13
    assert result.summary.maximum_cycle_time == 13
    # Only the three completed entities contribute to system-level waiting.
    assert result.summary.average_waiting_time == 4
    assert result.summary.maximum_waiting_time == 8
    assert result.summary.throughput_per_hour == 9  # 3 completions in 20 minutes


def test_rejection_and_remaining_queue_length_are_counted_correctly() -> None:
    finite = simulate(queue_model(1, max_entities=5))
    queue = finite.node_metrics["line"]
    assert isinstance(queue, QueueMetrics)
    assert finite.summary.total_generated == 5
    assert finite.summary.total_completed == 2
    assert finite.summary.total_rejected == 3
    assert finite.summary.completion_rate == pytest.approx(2 / 5)
    assert queue.total_arrivals == 5
    assert queue.rejected_entities == 3
    assert queue.average_queue_length == pytest.approx(4 / 20)
    assert queue.maximum_queue_length == 1
    assert queue.average_waiting_time == 2  # waits are 0 and 4
    assert queue.maximum_waiting_time == 4

    unlimited = simulate(queue_model(None, max_entities=5))
    remaining = unlimited.node_metrics["line"]
    assert isinstance(remaining, QueueMetrics)
    assert remaining.waiting_at_end == 1
    assert remaining.average_queue_length == pytest.approx(2.0)
    assert unlimited.time_series.queue_lengths["line"][-1].value == 1


def test_parallel_resource_utilization_includes_active_service_at_horizon() -> None:
    model = simple_model()
    model["simulation"]["duration"] = 10
    model["nodes"][0]["config"].update({"mean_interarrival_time": 1, "max_entities": 6})
    model["nodes"][1]["config"].update({"resource_count": 3, "mean_service_time": 5})
    result = simulate(model)
    process = result.node_metrics["service"]
    assert isinstance(process, ProcessMetrics)
    # Three finished services contribute 15 busy minutes; the three active
    # services contribute 5+4+3 minutes up to the horizon. 27 / (3*10) = 0.9.
    assert process.total_busy_resource_time == 27
    assert process.resource_utilization == pytest.approx(0.9)
    assert process.entities_processed == 3
    assert process.average_service_time == 5


def test_no_completed_service_has_no_average_and_busy_time_still_counts() -> None:
    model = simple_model()
    model["simulation"]["duration"] = 10
    model["nodes"][1]["config"]["mean_service_time"] = 10
    result = simulate(model)
    process = result.node_metrics["service"]
    assert isinstance(process, ProcessMetrics)
    assert result.summary.average_cycle_time is None
    assert result.summary.maximum_cycle_time is None
    assert result.summary.throughput_per_hour == 0
    assert process.average_service_time is None
    assert process.total_busy_resource_time == 10
    assert process.resource_utilization == 1


def test_result_schema_and_metrics_recompute_from_events() -> None:
    model = SimulationModel.model_validate(queue_model(None))
    result = simulate(model)
    assert build_result(model, result.events, result.entities) == result
    payload = result.model_dump()
    assert set(payload) == {"simulationId", "summary", "nodeMetrics", "timeSeries", "events", "entities", "bottleneckAnalysis"}
    assert "throughput" in payload["summary"]
    assert payload["simulationId"].startswith(model.id)
    assert SimulationResult.model_validate(payload) == result
    assert simulate(model).simulation_id == result.simulation_id

    changed = model.model_copy(deep=True)
    changed.simulation.seed += 1
    assert simulate(changed).simulation_id != result.simulation_id

    published = EXAMPLES.parent / "simulation-result.schema.json"
    assert published.read_text() == schema_text()
