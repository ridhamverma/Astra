"""API-facing model checks and clear, bounded validation errors."""

from typing import Any

from pydantic import ValidationError

from app.api.schemas import ApiIssue, ErrorCode
from app.schemas.simulation import ProcessNode, SimulationModel, SourceNode
from app.simulation import CyclicModelError, UnsupportedModelError, validate_executable_model
from app.simulation.engine import MAX_ENTITIES_PER_RUN

MAX_NODES = 100
MAX_EDGES = 300
MAX_DURATION_MINUTES = 10_080
MAX_RESOURCES_PER_PROCESS = 100


class ApiProblem(Exception):
    def __init__(self, code: ErrorCode, message: str, details: list[ApiIssue], status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.status_code = status_code


def _issue(code: ErrorCode, path: str, message: str) -> ApiIssue:
    return ApiIssue(code=code, path=path, message=message)


def _limit(path: str, message: str) -> ApiProblem:
    return ApiProblem("invalid_configuration", "Simulation limits exceeded", [_issue("invalid_configuration", path, message)])


def _from_pydantic(error: ValidationError) -> ApiProblem:
    issues: list[ApiIssue] = []
    for detail in error.errors(include_url=False):
        path = ".".join(str(part) for part in detail["loc"]) or "model"
        message = detail["msg"].removeprefix("Value error, ")
        kind = detail["type"]
        field = str(detail["loc"][-1]) if detail["loc"] else ""
        if not detail["loc"]:
            code: ErrorCode = "invalid_graph"
        elif kind in {"union_tag_invalid", "union_tag_not_found"} or (
            kind == "literal_error" and field in {"distribution", "service_distribution", "discipline", "routing", "type"}
        ):
            code = "unsupported_input"
        else:
            code = "invalid_configuration"
        issues.append(_issue(code, path, message))
    category = issues[0].code if issues else "invalid_configuration"
    return ApiProblem(category, "Simulation model validation failed", issues, 400 if category == "unsupported_input" else 422)


def validate_request_payload(payload: Any) -> SimulationModel:
    """Validate input shape, model, execution graph, and API run limits."""
    if not isinstance(payload, dict):
        raise ApiProblem(
            "unsupported_input",
            "Expected a simulation model JSON object",
            [_issue("unsupported_input", "body", "Expected a JSON object")],
            400,
        )

    raw_nodes = payload.get("nodes")
    raw_edges = payload.get("edges")
    if isinstance(raw_nodes, list) and len(raw_nodes) > MAX_NODES:
        raise _limit("nodes", f"At most {MAX_NODES} nodes are allowed")
    if isinstance(raw_edges, list) and len(raw_edges) > MAX_EDGES:
        raise _limit("edges", f"At most {MAX_EDGES} edges are allowed")

    try:
        model = validate_executable_model(payload)
    except ValidationError as error:
        raise _from_pydantic(error) from None
    except (CyclicModelError, UnsupportedModelError) as error:
        raise ApiProblem("invalid_graph", "Simulation graph cannot run", [_issue("invalid_graph", "edges", str(error))]) from None

    if model.simulation.duration > MAX_DURATION_MINUTES:
        raise _limit("simulation.duration", f"Duration must not exceed {MAX_DURATION_MINUTES} simulated minutes")
    for index, node in enumerate(model.nodes):
        if isinstance(node, ProcessNode) and node.config.resource_count > MAX_RESOURCES_PER_PROCESS:
            raise _limit(f"nodes.{index}.config.resource_count", f"Resource count must not exceed {MAX_RESOURCES_PER_PROCESS}")
        if isinstance(node, SourceNode) and node.config.max_entities is not None and node.config.max_entities > MAX_ENTITIES_PER_RUN:
            raise _limit(f"nodes.{index}.config.max_entities", f"Source entity count must not exceed {MAX_ENTITIES_PER_RUN}")
    return model
