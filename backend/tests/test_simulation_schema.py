import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.simulation import SimulationModel
from scripts.export_simulation_schema import schema_text


EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "examples"


def example(name: str = "hospital") -> dict:
    return json.loads((EXAMPLES / f"{name}.json").read_text())


def reject(data: dict, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        SimulationModel.model_validate(data)


@pytest.mark.parametrize("name", ["simple", "bank", "hospital"])
def test_example_models_round_trip(name: str) -> None:
    model = SimulationModel.model_validate(example(name))
    assert SimulationModel.model_validate_json(model.model_dump_json()) == model
    assert len(model.nodes) >= 3


@pytest.mark.parametrize("duplicate_kind", ["node", "edge", "cross"])
def test_duplicate_ids(duplicate_kind: str) -> None:
    data = example()
    if duplicate_kind == "node":
        data["nodes"][1]["id"] = data["nodes"][0]["id"]
    elif duplicate_kind == "edge":
        data["edges"][1]["id"] = data["edges"][0]["id"]
    else:
        data["edges"][0]["id"] = data["nodes"][0]["id"]
    reject(data, "duplicate node or edge IDs")


@pytest.mark.parametrize("field", ["source", "target"])
def test_edge_references_existing_nodes(field: str) -> None:
    data = example()
    data["edges"][0][field] = "missing-node"
    reject(data, f"references missing {field} node")


@pytest.mark.parametrize("node_type, message", [("source", "Source"), ("sink", "Sink")])
def test_requires_source_and_sink(node_type: str, message: str) -> None:
    data = example("simple")
    data["nodes"] = [node for node in data["nodes"] if node["type"] != node_type]
    data["edges"] = []
    reject(data, f"requires at least one {message}")


@pytest.mark.parametrize("duration", [0, -1, float("inf")])
def test_duration_must_be_positive_and_finite(duration: float) -> None:
    data = example("simple")
    data["simulation"]["duration"] = duration
    reject(data, "duration")


@pytest.mark.parametrize("count", [0, -1])
def test_resource_count_must_be_positive(count: int) -> None:
    data = example("simple")
    data["nodes"][1]["config"]["resource_count"] = count
    reject(data, "resource_count")


@pytest.mark.parametrize(
    "node_id, field",
    [
        ("patients", "mean_interarrival_time"),
        ("doctor", "mean_service_time"),
        ("paperwork", "mean_delay"),
    ],
)
def test_times_must_be_positive(node_id: str, field: str) -> None:
    data = example()
    next(node for node in data["nodes"] if node["id"] == node_id)["config"][field] = 0
    reject(data, field)


@pytest.mark.parametrize("node_id, field", [("patients", "distribution"), ("doctor", "service_distribution"), ("paperwork", "distribution")])
def test_unsupported_distribution(node_id: str, field: str) -> None:
    data = example()
    next(node for node in data["nodes"] if node["id"] == node_id)["config"][field] = "normal"
    reject(data, field)


@pytest.mark.parametrize("mutation, message", [
    ("missing", "requires a probability on every outgoing edge"),
    ("wrong_total", "probabilities must total approximately 1"),
    ("out_of_range", "probability"),
])
def test_decision_probabilities(mutation: str, message: str) -> None:
    data = example()
    edge = next(edge for edge in data["edges"] if edge["id"] == "e-decision-paperwork")
    if mutation == "missing":
        del edge["probability"]
    elif mutation == "wrong_total":
        edge["probability"] = 0.2
    else:
        edge["probability"] = 1.2
    reject(data, message)


def test_decision_requires_two_routes() -> None:
    data = example()
    data["edges"] = [edge for edge in data["edges"] if edge["id"] != "e-decision-paperwork"]
    reject(data, "requires at least two outgoing routes")


@pytest.mark.parametrize("node_id, field", [
    ("registration", "minimum_service_time"),
    ("paperwork", "maximum_delay"),
])
def test_uniform_requires_both_bounds(node_id: str, field: str) -> None:
    data = example()
    del next(node for node in data["nodes"] if node["id"] == node_id)["config"][field]
    reject(data, "requires minimum and maximum bounds")


def test_uniform_mean_matches_bounds() -> None:
    data = example()
    next(node for node in data["nodes"] if node["id"] == "registration")["config"]["mean_service_time"] = 5
    reject(data, "mean must equal the midpoint")


def test_uniform_source_and_small_probability_rounding() -> None:
    data = example()
    source = next(node for node in data["nodes"] if node["id"] == "patients")
    source["config"] = {
        "distribution": "uniform",
        "mean_interarrival_time": 5,
        "minimum_interarrival_time": 4,
        "maximum_interarrival_time": 6,
    }
    edge = next(edge for edge in data["edges"] if edge["id"] == "e-decision-paperwork")
    edge["probability"] = 0.3000001
    SimulationModel.model_validate(data)


def test_optional_limits_and_cost_must_be_valid() -> None:
    data = example("bank")
    source = next(node for node in data["nodes"] if node["type"] == "source")
    process = next(node for node in data["nodes"] if node["type"] == "process")
    source["config"]["max_entities"] = 0
    reject(data, "max_entities")
    source["config"]["max_entities"] = 10
    process["config"]["cost_per_resource"] = -1
    reject(data, "cost_per_resource")


def test_queue_capacity_can_be_unlimited_or_zero() -> None:
    data = example("bank")
    queue = next(node for node in data["nodes"] if node["type"] == "queue")
    for capacity in (None, 0):
        queue["config"]["capacity"] = capacity
        SimulationModel.model_validate(data)
    queue["config"]["capacity"] = -1
    reject(data, "capacity")


def test_only_fifo_supported() -> None:
    data = example("bank")
    next(node for node in data["nodes"] if node["type"] == "queue")["config"]["discipline"] = "lifo"
    reject(data, "discipline")


def test_only_six_node_types_supported() -> None:
    data = example("simple")
    data["nodes"][1]["type"] = "machine"
    reject(data, "type")


def test_rejects_unknown_config_fields() -> None:
    data = deepcopy(example("simple"))
    data["nodes"][0]["config"]["unknown"] = 1
    reject(data, "Extra inputs are not permitted")


def test_non_decision_cannot_branch_or_assign_probabilities() -> None:
    data = example("simple")
    data["edges"][0]["probability"] = 1
    reject(data, "cannot assign edge probabilities")
    del data["edges"][0]["probability"]
    data["edges"].append({"id": "extra", "source": "arrivals", "target": "exit"})
    reject(data, "cannot have multiple outgoing edges")


def test_sink_cannot_have_outgoing_edge() -> None:
    data = example("simple")
    data["edges"].append({"id": "restart", "source": "exit", "target": "arrivals"})
    reject(data, "cannot have outgoing edges")


def test_published_json_schema_matches_backend() -> None:
    published = EXAMPLES.parent / "simulation-model.schema.json"
    assert published.read_text() == schema_text()


def test_optional_decision_handle_metadata_roundtrips():
    import json
    from pathlib import Path

    raw = json.loads((Path(__file__).resolve().parents[2] / "docs/examples/hospital.json").read_text())
    decision_ids = {node["id"] for node in raw["nodes"] if node["type"] == "decision"}
    branches = [edge for edge in raw["edges"] if edge["source"] in decision_ids]
    for index, edge in enumerate(branches):
        edge["sourceHandle"] = "yes" if index == 0 else "no"
    model = SimulationModel.model_validate(raw)
    assert [edge.sourceHandle for edge in model.edges if edge.source in decision_ids] == ["yes", "no"]
    assert SimulationModel.model_validate_json(model.model_dump_json()) == model
