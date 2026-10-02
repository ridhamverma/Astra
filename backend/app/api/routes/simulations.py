"""Versioned simulation validation and execution endpoints."""

from typing import Any

from fastapi import APIRouter, Body

from app.api.schemas import ApiIssue, ValidationResponse
from app.api.simulation_validation import ApiProblem, validate_request_payload
from app.simulation import SimulationLimitError, simulate
from app.simulation.results import SimulationResult

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])


@router.post("/validate", response_model=ValidationResponse)
def validate_simulation(payload: Any = Body(...)) -> ValidationResponse:
    try:
        validate_request_payload(payload)
    except ApiProblem as problem:
        return ValidationResponse(valid=False, errors=problem.details)
    return ValidationResponse(valid=True, errors=[])


@router.post("/run", response_model=SimulationResult)
def run_simulation(payload: Any = Body(...)) -> SimulationResult:
    model = validate_request_payload(payload)
    try:
        return simulate(model)
    except SimulationLimitError as error:
        raise ApiProblem(
            "failed_simulation",
            "Simulation exceeded a safety limit",
            [ApiIssue(code="failed_simulation", path="model", message=str(error))],
        ) from None
