"""Response DTOs returned by the analysis pipeline."""

from pydantic import BaseModel, Field


class AttackPrediction(BaseModel):
    """Represents a single ML ranking output."""

    attack_name: str
    probability: float
    rationale: str | None = None


class DefenseSuggestion(BaseModel):
    """Represents a defense recommendation entry."""

    title: str
    description: str
    source: str | None = None


class Diagnostics(BaseModel):
    """Execution trace that helps debugging and observability."""

    normalized_artifact: str
    normalized_description: str
    thresholds: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    processing_steps: list[str] = Field(default_factory=list)
    data_sources: dict[str, str] = Field(default_factory=dict)


class GraphNode(BaseModel):
    """Graph-ready node model used by frontend visualization."""

    id: str
    label: str
    type: str


class GraphEdge(BaseModel):
    """Graph-ready edge model used by frontend visualization."""

    source: str
    target: str
    label: str


class GraphFocus(BaseModel):
    """Graph focus metadata for frontend camera and context panels."""

    artifact: str
    matched_artifact: str | None = None
    analysis_mode: str = "new"


class GraphContextResponse(BaseModel):
    """Normalized node-edge payload for live graph rendering."""

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    focus: GraphFocus


class ArtifactOption(BaseModel):
    """Canonical artifact item used for existing-artifact selection."""

    name: str
    category: str


class AnalyzeResponse(BaseModel):
    """Unified response model for the /analyze endpoint."""

    input_artifact: str
    matched_artifact: str | None = None
    matched_category: str | None = None
    mapping_method: str
    confidence_score: float
    confidence_label: str
    direct_attacks: list[str] = Field(default_factory=list)
    direct_tactics: list[str] = Field(default_factory=list)
    next_tactics: list[str] = Field(default_factory=list)
    predicted_attacks_top5: list[AttackPrediction] = Field(default_factory=list)
    defense_suggestions: list[DefenseSuggestion] = Field(default_factory=list)
    low_confidence_reason: str | None = None
    diagnostics: Diagnostics
