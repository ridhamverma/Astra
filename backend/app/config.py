import json
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Astra API"
    cors_origins: list[str] | str = Field(
        default=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ],
        validation_alias=AliasChoices("ASTRA_CORS_ORIGINS", "CORS_ORIGINS"),
    )
    ai_provider: str = Field(
        default="gemini",
        validation_alias=AliasChoices("ASTRA_AI_PROVIDER", "AI_PROVIDER"),
    )
    gemini_model: str = Field(
        default="gemini-3.1-flash-lite",
        validation_alias=AliasChoices("ASTRA_GEMINI_MODEL", "GEMINI_MODEL"),
    )
    gemini_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("ASTRA_GEMINI_API_KEY", "AI_API_KEY", "GEMINI_API_KEY"),
    )
    jwt_secret: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "ASTRA_JWT_SECRET", "JWT_SECRET", "ASTRA_SESSION_SECRET", "SESSION_SECRET"
        ),
    )
    environment: Literal["development", "production"] = Field(
        default="development",
        validation_alias=AliasChoices("ASTRA_ENVIRONMENT", "ENVIRONMENT", "NODE_ENV"),
    )
    cookie_secure: bool = Field(
        default=False,
        validation_alias=AliasChoices("ASTRA_COOKIE_SECURE", "COOKIE_SECURE"),
    )
    cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax",
        validation_alias=AliasChoices("ASTRA_COOKIE_SAMESITE", "COOKIE_SAMESITE"),
    )
    session_hours: int = Field(
        default=24,
        ge=1,
        le=168,
        validation_alias=AliasChoices("ASTRA_SESSION_HOURS", "SESSION_HOURS"),
    )
    database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ASTRA_DATABASE_URL", "DATABASE_URL"),
    )

    @field_validator("cors_origins", mode="after")
    @classmethod
    def normalize_cors_origins(cls, v: list[str] | str) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    loaded = json.loads(v)
                    if isinstance(loaded, list):
                        return [str(x).strip() for x in loaded if str(x).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return [str(origin).strip() for origin in v if str(origin).strip()]

    @model_validator(mode="after")
    def production_security(self):
        for origin in self.cors_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or "*" in parsed.netloc
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
            ):
                raise ValueError(
                    "CORS origins must be explicit HTTP(S) origins without paths or credentials"
                )
        if self.environment == "production":
            if not self.cookie_secure:
                raise ValueError("Production requires ASTRA_COOKIE_SECURE=true")
            if (
                not self.database_url
                or not self.cors_origins
                or any(not origin.startswith("https://") for origin in self.cors_origins)
            ):
                raise ValueError("Production requires a database and explicit HTTPS CORS origins")
            if self.cookie_samesite == "none" and not self.cookie_secure:
                raise ValueError("SameSite=None cookies require ASTRA_COOKIE_SECURE=true")
        return self

    model_config = SettingsConfigDict(
        env_prefix="ASTRA_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

