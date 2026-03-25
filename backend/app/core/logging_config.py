"""Logging configuration utilities."""

import logging

from app.core.config import get_settings


def configure_logging() -> None:
    """Configure root logging once for the API process."""
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
