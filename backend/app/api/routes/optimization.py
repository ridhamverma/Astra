from typing import Any
from fastapi import APIRouter, Body
from pydantic import ValidationError

from app.api.simulation_validation import ApiProblem, _from_pydantic, validate_request_payload
from app.optimization import optimize, OptimizationError, OptimizationExecutionError
from app.schemas.optimization import OptimizationRequest, OptimizationResult

router = APIRouter(prefix='/api/v1', tags=['optimization'])

@router.post('/optimize', response_model=OptimizationResult)
def optimize_model(payload: Any = Body(...)) -> OptimizationResult:
    if isinstance(payload, dict) and "base_model" in payload:
        payload = {**payload, "base_model": validate_request_payload(payload["base_model"])}
    try:
        request = OptimizationRequest.model_validate(payload)
    except ValidationError as error:
        raise _from_pydantic(error) from None
    try:
        return optimize(request)
    except OptimizationError as error:
        raise ApiProblem('invalid_configuration', str(error), [], 422) from None
    except OptimizationExecutionError as error:
        raise ApiProblem('failed_optimization', str(error), [], 422) from None
