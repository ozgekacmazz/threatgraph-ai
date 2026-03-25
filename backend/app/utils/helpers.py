"""Shared helper utilities used across services."""

import re
from difflib import SequenceMatcher


def normalize_text(value: str) -> str:
    """Lower-case and collapse whitespace for stable comparisons."""
    value = value.strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value


def confidence_to_label(score: float) -> str:
    """Convert a numeric confidence score into a human-readable bucket."""
    if score >= 0.85:
        return "high"
    if score >= 0.60:
        return "medium"
    return "low"


def similarity_score(left: str, right: str) -> float:
    """Lightweight string similarity fallback until domain embeddings are added."""
    return SequenceMatcher(None, left, right).ratio()
