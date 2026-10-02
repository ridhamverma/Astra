import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.simulation_validation import ApiProblem
from app.config import get_settings
from app.database.session import get_db
from app.schemas.health import HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Liveness probe: verifies backend process is running."""
    return HealthResponse(status="ok", service="astra-backend")


@router.get("/health/ready", tags=["health"])
@router.get("/api/v1/health", tags=["health"])
def readiness() -> dict[str, Any]:
    """Readiness probe: verifies database connection and service configuration."""
    settings = get_settings()
    db_status = "unconfigured"
    if settings.database_url:
        try:
            from app.database.session import get_engine
            engine = get_engine()
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception as error:
            logger.warning("Readiness probe database check failed: %s", type(error).__name__)
            raise ApiProblem("service_unavailable", "Database check failed", [], 503) from None

    return {
        "status": "ready",
        "service": "astra-backend",
        "database": db_status,
        "environment": settings.environment,
        "ai_enabled": bool(settings.gemini_api_key),
    }


