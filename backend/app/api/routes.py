"""HTTP routes for artifact analysis."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.request_models import AnalyzeRequest, GraphContextRequest
from app.schemas.response_models import AnalyzeResponse, ArtifactOption, GraphContextResponse
from app.services.analysis_service import AnalysisService, get_analysis_service

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)


@router.get("/artifacts", response_model=list[ArtifactOption], summary="List canonical artifacts")
async def list_artifacts_endpoint(
    service: AnalysisService = Depends(get_analysis_service),
) -> list[ArtifactOption]:
    """Return canonical artifacts to power existing-artifact selection UX."""
    try:
        return service.list_artifacts()
    except Exception as exc:  # pragma: no cover - runtime safety
        logger.exception("Artifact list endpoint failed.")
        raise HTTPException(
            status_code=500,
            detail="Artifact listesi alınamadı. Neo4j bağlantısını ve backend loglarını kontrol edin.",
        ) from exc


@router.post("/analyze", response_model=AnalyzeResponse, summary="Analyze a cybersecurity artifact")
async def analyze_artifact_endpoint(
    payload: AnalyzeRequest,
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalyzeResponse:
    """Expose the central analysis pipeline over HTTP."""
    try:
        return service.analyze_artifact(
            artifact_name=payload.artifact_name,
            description=payload.description,
            analysis_mode=payload.analysis_mode,
        )
    except Exception as exc:  # pragma: no cover - runtime safety
        logger.exception("Analyze endpoint failed for artifact '%s'.", payload.artifact_name)
        raise HTTPException(
            status_code=500,
            detail="Analiz işlenemedi. Backend loglarını kontrol edin ve girdi alanlarını yeniden deneyin.",
        ) from exc


@router.post(
    "/graph/context",
    response_model=GraphContextResponse,
    summary="Return graph-ready cybersecurity context for visualization",
)
async def graph_context_endpoint(
    payload: GraphContextRequest,
    service: AnalysisService = Depends(get_analysis_service),
) -> GraphContextResponse:
    """Expose graph-ready node-edge data for live frontend visualization."""
    try:
        return service.build_graph_context(
            artifact_name=payload.artifact_name,
            matched_artifact=payload.matched_artifact,
            analysis_mode=payload.analysis_mode,
        )
    except Exception as exc:  # pragma: no cover - runtime safety
        logger.exception("Graph context endpoint failed for artifact '%s'.", payload.artifact_name)
        raise HTTPException(
            status_code=500,
            detail=(
                "Graph bağlamı üretilemedi. Neo4j bağlantısını, backend .env ayarlarını ve sunucu loglarını kontrol edin."
            ),
        ) from exc
