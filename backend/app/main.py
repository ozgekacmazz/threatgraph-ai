"""FastAPI entry point for the cyber analysis backend."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as analysis_router
from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.services.analysis_service import get_analysis_service

configure_logging()
settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize shared services on startup and close them on shutdown."""
    logger.info(
        "Configuration loaded from %s (exists=%s). Neo4j configured=%s.",
        settings.env_file_path,
        settings.env_file_path.exists(),
        all([settings.neo4j_uri, settings.neo4j_username, settings.neo4j_password]),
    )

    analysis_service = get_analysis_service()
    neo4j_client = analysis_service.reasoning_service.neo4j_client
    if neo4j_client.is_available():
        logger.info("Startup completed with Neo4j connectivity enabled.")
    else:
        logger.warning(
            "Startup completed without Neo4j connectivity. "
            "Graph-backed features will return graceful fallback responses. Last error: %s",
            neo4j_client.connection_error or "missing configuration",
        )

    try:
        yield
    finally:
        analysis_service.close()
        logger.info("Application shutdown complete.")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Cybersecurity artifact analysis system using KG, rules, reasoning, and ML.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix=settings.api_prefix)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Simple readiness endpoint for deployments and local checks."""
    analysis_service = get_analysis_service()
    neo4j_client = analysis_service.reasoning_service.neo4j_client
    return {
        "status": "ok",
        "api_prefix": settings.api_prefix,
        "neo4j": "available" if neo4j_client.is_available() else "unavailable",
        "neo4j_error": neo4j_client.connection_error or "",
    }
