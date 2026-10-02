import logging

from fastapi import FastAPI, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.hardening import RequestSafetyMiddleware
from app.api.auth import get_current_user
from app.api.routes.auth import router as auth_router
from app.api.routes.templates import router as templates_router
from app.api.routes.optimization import router as optimization_router
from app.api.routes.ai import router as ai_router
from app.api.routes.scenarios import router as scenarios_router
from app.api.routes.health import router as health_router
from app.api.routes.projects import router as projects_router
from app.api.routes.simulations import router as simulations_router
from app.api.schemas import ApiErrorBody, ApiErrorResponse, ApiIssue
from app.api.simulation_validation import ApiProblem
from app.config import get_settings

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.add_middleware(RequestSafetyMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth_router)
    app.include_router(templates_router, dependencies=[Depends(get_current_user)])
    app.include_router(optimization_router, dependencies=[Depends(get_current_user)])
    app.include_router(ai_router, dependencies=[Depends(get_current_user)])
    app.include_router(health_router)
    app.include_router(simulations_router, dependencies=[Depends(get_current_user)])
    app.include_router(projects_router, dependencies=[Depends(get_current_user)])
    app.include_router(scenarios_router, dependencies=[Depends(get_current_user)])

    @app.exception_handler(ApiProblem)
    async def handle_api_problem(request: Request, problem: ApiProblem) -> JSONResponse:
        response = ApiErrorResponse(
            error=ApiErrorBody(code=problem.code, message=problem.message, details=problem.details)
        )
        return JSONResponse(status_code=problem.status_code, content=response.model_dump())

    @app.exception_handler(RequestValidationError)
    async def handle_bad_request(request: Request, error: RequestValidationError) -> JSONResponse:
        response = ApiErrorResponse(
            error=ApiErrorBody(
                code="unsupported_input",
                message="Request body must contain valid JSON",
                details=[ApiIssue(code="unsupported_input", path="body", message="Invalid or missing JSON body")],
            )
        )
        return JSONResponse(status_code=400, content=response.model_dump())

    @app.exception_handler(Exception)
    async def handle_internal_error(request: Request, error: Exception) -> JSONResponse:
        logger.error("Unhandled API error at %s (%s)", request.url.path, type(error).__name__)
        response = ApiErrorResponse(
            error=ApiErrorBody(code="internal_server_error", message="Internal server error", details=[])
        )
        return JSONResponse(status_code=500, content=response.model_dump())

    return app


app = create_app()
