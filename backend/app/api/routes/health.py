import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import APIRouter
from sqlalchemy import text

from app.api.simulation_validation import ApiProblem
from app.config import get_settings
from app.schemas.health import HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def required_database_heads() -> set[str]:
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[3] / "alembic"))
    return set(ScriptDirectory.from_config(config).get_heads())


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Liveness probe: verifies backend process is running."""
    return HealthResponse(status="ok", service="astra-backend")


@router.get("/health/ready", tags=["health"])
@router.get("/api/v1/health", tags=["health"])
def readiness() -> dict[str, Any]:
    """Readiness probe: verifies database connection and service configuration."""
    settings = get_settings()
    if not settings.database_url:
        raise ApiProblem("service_unavailable", "Configure ASTRA_DATABASE_URL and run alembic upgrade head", [], 503)
    try:
        from app.database.session import get_engine
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            if set(MigrationContext.configure(conn).get_current_heads()) != required_database_heads():
                raise ApiProblem("service_unavailable", "Database migrations are incomplete. Run alembic upgrade head", [], 503)
    except ApiProblem:
        raise
    except Exception as error:
        logger.warning("Readiness probe database check failed: %s", type(error).__name__)
        raise ApiProblem("service_unavailable", "Database check failed", [], 503) from None

    return {
        "status": "ready",
        "service": "astra-backend",
        "database": "connected",
        "environment": settings.environment,
        "ai_enabled": settings.ai_provider == "gemini" and bool(settings.gemini_api_key and settings.gemini_api_key.get_secret_value()),
    }


