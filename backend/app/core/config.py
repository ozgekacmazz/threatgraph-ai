"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE_PATH = BACKEND_DIR / ".env"
ENV_EXAMPLE_PATH = BACKEND_DIR / ".env.example"


def load_environment() -> Path:
    """Load the backend-local .env file into process environment variables."""
    load_dotenv(ENV_FILE_PATH, override=False)
    return ENV_FILE_PATH


class Settings(BaseSettings):
    """Centralized runtime settings."""

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Cyber KG ML Analysis API"
    api_prefix: str = "/api"
    log_level: str = "INFO"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        ]
    )

    NEO4J_URI: str | None = None
    NEO4J_USERNAME: str | None = None
    NEO4J_PASSWORD: str | None = None
    NEO4J_DATABASE: str = "neo4j"

    analysis_data_dir: str = "analysis/data"
    ml_model_path: str = "analysis/models/best_attack_model.pkl"
    ml_encoders_path: str = "analysis/models/attack_label_encoders.pkl"
    low_confidence_threshold: float = 0.55
    strict_prediction_threshold: float = 0.70

    @property
    def neo4j_uri(self) -> str | None:
        return self.NEO4J_URI

    @property
    def neo4j_username(self) -> str | None:
        return self.NEO4J_USERNAME

    @property
    def neo4j_password(self) -> str | None:
        return self.NEO4J_PASSWORD

    @property
    def neo4j_database(self) -> str:
        return self.NEO4J_DATABASE

    @property
    def env_file_path(self) -> Path:
        return ENV_FILE_PATH


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance."""
    load_environment()
    return Settings()
