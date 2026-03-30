"""Request DTOs for API endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


AnalysisMode = Literal["new", "known"]


class AnalyzeRequest(BaseModel):
    """Incoming request for artifact analysis."""

    artifact_name: str = Field(..., min_length=1, description="Artifact name to analyze")
    description: str | None = Field(
        default=None,
        description="Optional natural language artifact description.",
    )
    analysis_mode: AnalysisMode = Field(
        default="new",
        description="Whether the artifact should be treated as a new entry or an existing graph artifact.",
    )


class GraphContextRequest(BaseModel):
    """Request DTO for graph-ready node-edge context."""

    artifact_name: str = Field(..., min_length=1, description="Artifact name to focus in the graph")
    matched_artifact: str | None = Field(
        default=None,
        description="Resolved artifact name from the analysis response if already available.",
    )
    analysis_mode: AnalysisMode = Field(
        default="new",
        description="Whether graph focus comes from a new artifact flow or an existing artifact flow.",
    )


class ScenarioAnalyzeRequest(BaseModel):
    """Incoming request for free-text scenario analysis."""

    text: str = Field(..., min_length=1, description="Free-text security scenario to analyze.")
