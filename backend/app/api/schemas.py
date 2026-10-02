"""Shared response shapes for simulation API validation and errors."""

from typing import Literal

from pydantic import BaseModel


ErrorCode = Literal[
    "unauthorized", "forbidden", "conflict", "rate_limited",
    "invalid_graph",
    "invalid_configuration",
    "unsupported_input",
    "failed_simulation",
    "failed_optimization",
    "internal_server_error",
    "not_found",
    "ai_unavailable",
    "invalid_ai_output",
]


class ApiIssue(BaseModel):
    code: ErrorCode
    path: str
    message: str


class ValidationResponse(BaseModel):
    valid: bool
    errors: list[ApiIssue]


class ApiErrorBody(BaseModel):
    code: ErrorCode
    message: str
    details: list[ApiIssue]


class ApiErrorResponse(BaseModel):
    error: ApiErrorBody
