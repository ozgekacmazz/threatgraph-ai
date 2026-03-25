"""Main orchestration service for artifact analysis."""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.db.neo4j_client import Neo4jClient
from app.schemas.request_models import AnalysisMode
from app.schemas.response_models import (
    AnalyzeResponse,
    ArtifactOption,
    Diagnostics,
    GraphContextResponse,
    GraphEdge,
    GraphFocus,
    GraphNode,
)
from app.services.defense_service import DefenseService
from app.services.mapping_service import MappingService
from app.services.ml_service import MLService
from app.services.reasoning_service import ReasoningService
from app.utils.helpers import confidence_to_label

logger = logging.getLogger(__name__)


class AnalysisService:
    """Coordinates mapping, KG reasoning, ML ranking, and defense suggestions."""

    def __init__(
        self,
        mapping_service: MappingService,
        reasoning_service: ReasoningService,
        ml_service: MLService,
        defense_service: DefenseService,
    ) -> None:
        self.settings = get_settings()
        self.mapping_service = mapping_service
        self.reasoning_service = reasoning_service
        self.ml_service = ml_service
        self.defense_service = defense_service

    def close(self) -> None:
        """Release shared resources when the application shuts down."""
        self.reasoning_service.neo4j_client.close()

    def analyze_artifact(
        self,
        artifact_name: str,
        description: str | None,
        analysis_mode: AnalysisMode = "new",
    ) -> AnalyzeResponse:
        """Central analysis pipeline preserving the existing API contract."""
        normalized_mode = self._normalize_analysis_mode(analysis_mode)
        safe_description = description or ""
        normalized_artifact, normalized_description = self.mapping_service.normalize_inputs(
            artifact_name,
            safe_description,
        )
        diagnostics = Diagnostics(
            normalized_artifact=normalized_artifact,
            normalized_description=normalized_description,
            thresholds={
                "low_confidence_threshold": self.settings.low_confidence_threshold,
                "strict_prediction_threshold": self.settings.strict_prediction_threshold,
            },
            processing_steps=["normalize_input"],
            data_sources={
                "analysis_mode": normalized_mode,
                "neo4j": "configured" if self.reasoning_service.neo4j_client.is_available() else "not_configured",
                "ml_model": "loaded" if self.ml_service.model_bundle else "not_loaded",
                "ml_encoders": "loaded" if self.ml_service.encoders else "not_loaded",
                "analysis_csv": "loaded" if self.ml_service.csv_data else "not_loaded",
                "candidate_match_count": "0",
                "matched_rules_count": "0",
                "explicit_mapping_used": "false",
                "graph_signals_found": "false",
                "ml_candidate_count": "0",
                "abstention_triggered": "false",
            },
        )

        artifact_records: list[dict[str, str]] = []
        mapping_rules: list[dict[str, str]] = []
        try:
            artifact_records, mapping_rules = self.mapping_service.fetch_context()
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"Graph context loading failed: {exc}")
        diagnostics.processing_steps.append("load_graph_artifacts_and_mapping_rules")
        diagnostics.data_sources["artifact_record_count"] = str(len(artifact_records))
        diagnostics.data_sources["mapping_rule_count"] = str(len(mapping_rules))

        best_match = self._safe_select_best_match(
            artifact_name=artifact_name,
            description=safe_description,
            artifact_records=artifact_records,
            mapping_rules=mapping_rules,
            diagnostics=diagnostics,
        )
        diagnostics.processing_steps.append("resolve_best_artifact")
        diagnostics.data_sources["candidate_match_count"] = str(len(best_match.top_matches))
        diagnostics.data_sources["matched_rules_count"] = str(best_match.matched_rule_count)
        diagnostics.data_sources["explicit_mapping_used"] = str(
            best_match.mapping_method == "explicit_mapping"
        ).lower()
        diagnostics.data_sources["mapping_dominant_source"] = best_match.dominant_source
        logger.info(
            "Analysis mapping result for artifact='%s': matched_artifact='%s', method='%s', confidence=%.4f, mode='%s'.",
            artifact_name,
            best_match.matched_artifact,
            best_match.mapping_method,
            best_match.confidence_score,
            normalized_mode,
        )

        diagnostics.warnings.extend(
            [
                f"Top match candidate: {match.matched_artifact} ({match.score:.4f})"
                for match in best_match.top_matches
            ]
        )
        if best_match.matched_keywords:
            diagnostics.warnings.append(
                "Matched keywords: " + ", ".join(best_match.matched_keywords[:10])
            )

        if normalized_mode == "new" and best_match.matched_artifact:
            persistence_note = self._safe_persist_best_match(
                artifact_name=artifact_name,
                best_match=best_match,
                diagnostics=diagnostics,
            )
            diagnostics.warnings.append(persistence_note)
            diagnostics.processing_steps.append("persist_best_match")
        elif normalized_mode == "known":
            diagnostics.processing_steps.append("skip_best_match_persistence_for_known_mode")

        direct_attacks, direct_tactics, next_tactics = self._safe_reasoning(
            matched_artifact=best_match.matched_artifact,
            diagnostics=diagnostics,
        )
        diagnostics.processing_steps.append("fetch_reasoning_summary")
        diagnostics.data_sources["graph_signals_found"] = str(
            bool(direct_attacks or direct_tactics or next_tactics)
        ).lower()
        diagnostics.data_sources["direct_attack_count"] = str(len(direct_attacks))
        diagnostics.data_sources["direct_tactic_count"] = str(len(direct_tactics))
        diagnostics.data_sources["next_tactic_count"] = str(len(next_tactics))

        predicted_attacks, ml_warnings = self._safe_rank_attacks(
            matched_artifact=best_match.matched_artifact,
            matched_category=best_match.matched_category,
            direct_attacks=direct_attacks,
            mapping_rules=mapping_rules,
            diagnostics=diagnostics,
        )
        diagnostics.processing_steps.append("rank_attacks_with_ml")
        diagnostics.warnings.extend(ml_warnings)
        diagnostics.data_sources["ml_candidate_count"] = str(len(direct_attacks))
        diagnostics.data_sources["ml_prediction_count"] = str(len(predicted_attacks))

        abstention_reasons = self._collect_abstention_reasons(
            confidence_score=best_match.confidence_score,
            matched_artifact=best_match.matched_artifact,
            graph_signals=bool(direct_attacks or direct_tactics or next_tactics),
            predictions=predicted_attacks,
        )
        low_confidence_reason = self._format_abstention_reason(abstention_reasons)

        if low_confidence_reason:
            predicted_attacks = []
            diagnostics.data_sources["abstention_triggered"] = "true"
            diagnostics.data_sources["abstention_reason_count"] = str(len(abstention_reasons))
            diagnostics.warnings.append(low_confidence_reason)
        else:
            diagnostics.data_sources["abstention_triggered"] = "false"
            diagnostics.data_sources["abstention_reason_count"] = "0"

        defense_suggestions = self._safe_build_defenses(
            matched_artifact=best_match.matched_artifact,
            direct_attacks=direct_attacks,
            direct_tactics=direct_tactics,
            next_tactics=next_tactics,
            predictions_available=bool(predicted_attacks),
            diagnostics=diagnostics,
        )
        diagnostics.processing_steps.append("fetch_defense_suggestions")
        diagnostics.data_sources["defense_suggestion_count"] = str(len(defense_suggestions))

        return AnalyzeResponse(
            input_artifact=artifact_name,
            matched_artifact=best_match.matched_artifact,
            matched_category=best_match.matched_category,
            mapping_method=best_match.mapping_method,
            confidence_score=round(best_match.confidence_score, 4),
            confidence_label=confidence_to_label(best_match.confidence_score),
            direct_attacks=direct_attacks,
            direct_tactics=direct_tactics,
            next_tactics=next_tactics,
            predicted_attacks_top5=predicted_attacks[:5],
            defense_suggestions=defense_suggestions,
            low_confidence_reason=low_confidence_reason,
            diagnostics=diagnostics,
        )

    def build_graph_context(
        self,
        artifact_name: str,
        matched_artifact: str | None = None,
        analysis_mode: AnalysisMode = "new",
    ) -> GraphContextResponse:
        """Return graph-ready nodes and edges for frontend visualization."""
        normalized_mode = self._normalize_analysis_mode(analysis_mode)
        resolved_artifact = matched_artifact

        if not resolved_artifact:
            try:
                artifact_records, mapping_rules = self.mapping_service.fetch_context()
            except Exception:  # pragma: no cover - graceful graph fallback
                artifact_records, mapping_rules = [], []
            best_match = self.mapping_service.select_best_artifact(
                input_artifact=artifact_name,
                artifact_records=artifact_records,
                mapping_rules=mapping_rules,
                description="",
            )
            resolved_artifact = best_match.matched_artifact

        direct_attacks, direct_tactics, next_tactics = self._safe_reasoning(
            matched_artifact=resolved_artifact,
            diagnostics=Diagnostics(
                normalized_artifact="",
                normalized_description="",
            ),
        )
        defenses = (
            self.defense_service.fetch_candidate_defenses(resolved_artifact)
            if resolved_artifact
            else []
        )

        nodes: list[GraphNode] = []
        edges: list[GraphEdge] = []
        node_ids: set[str] = set()

        def add_node(node_id: str, label: str, node_type: str) -> None:
            if node_id in node_ids:
                return
            node_ids.add(node_id)
            nodes.append(GraphNode(id=node_id, label=label, type=node_type))

        artifact_node_id = f"artifact:input:{artifact_name}"
        add_node(artifact_node_id, artifact_name, "artifact")

        matched_node_id: str | None = None
        if resolved_artifact:
            matched_node_id = f"artifact:matched:{resolved_artifact}"
            add_node(matched_node_id, resolved_artifact, "artifact")
            if matched_artifact or artifact_name.strip().lower() != resolved_artifact.strip().lower():
                edges.append(
                    GraphEdge(
                        source=artifact_node_id,
                        target=matched_node_id,
                        label="MATCHED_TO",
                    )
                )

        focus_artifact_node = matched_node_id or artifact_node_id
        for attack in direct_attacks:
            attack_id = f"attack:{attack}"
            add_node(attack_id, attack, "attack")
            edges.append(GraphEdge(source=focus_artifact_node, target=attack_id, label="DIRECT_ATTACK"))

        direct_tactic_ids: list[str] = []
        for tactic in direct_tactics:
            tactic_id = f"tactic:direct:{tactic}"
            add_node(tactic_id, tactic, "tactic")
            direct_tactic_ids.append(tactic_id)
            if direct_attacks:
                for attack in direct_attacks:
                    edges.append(
                        GraphEdge(
                            source=f"attack:{attack}",
                            target=tactic_id,
                            label="HAS_TACTIC",
                        )
                    )
            else:
                edges.append(GraphEdge(source=focus_artifact_node, target=tactic_id, label="HAS_TACTIC"))

        next_tactic_ids: list[str] = []
        for tactic in next_tactics:
            next_tactic_id = f"tactic:next:{tactic}"
            add_node(next_tactic_id, tactic, "tactic")
            next_tactic_ids.append(next_tactic_id)
            if direct_tactic_ids:
                for direct_tactic_id in direct_tactic_ids:
                    edges.append(
                        GraphEdge(
                            source=direct_tactic_id,
                            target=next_tactic_id,
                            label="NEXT_TACTIC",
                        )
                    )
            else:
                edges.append(
                    GraphEdge(
                        source=focus_artifact_node,
                        target=next_tactic_id,
                        label="NEXT_TACTIC",
                    )
                )

        for defense in defenses:
            defense_id = f"defense:{defense}"
            add_node(defense_id, defense, "defense")
            if next_tactic_ids:
                for next_tactic_id in next_tactic_ids:
                    edges.append(
                        GraphEdge(
                            source=next_tactic_id,
                            target=defense_id,
                            label="DEFENDED_BY",
                        )
                    )
            elif direct_tactic_ids:
                for direct_tactic_id in direct_tactic_ids:
                    edges.append(
                        GraphEdge(
                            source=direct_tactic_id,
                            target=defense_id,
                            label="DEFENDED_BY",
                        )
                    )
            else:
                edges.append(GraphEdge(source=focus_artifact_node, target=defense_id, label="DEFENDED_BY"))

        return GraphContextResponse(
            nodes=nodes,
            edges=edges,
            focus=GraphFocus(
                artifact=artifact_name,
                matched_artifact=resolved_artifact,
                analysis_mode=normalized_mode,
            ),
        )

    def list_artifacts(self) -> list[ArtifactOption]:
        """Return canonical artifacts for existing-artifact selection UX."""
        artifacts = self.mapping_service.fetch_context()[0]
        return [
            ArtifactOption(
                name=str(record.get("artifact", "")).strip(),
                category=str(record.get("category", "Unknown")).strip() or "Unknown",
            )
            for record in artifacts
            if str(record.get("artifact", "")).strip()
        ]

    @staticmethod
    def _normalize_analysis_mode(analysis_mode: AnalysisMode | str | None) -> AnalysisMode:
        if analysis_mode == "known":
            return "known"
        return "new"

    def _safe_select_best_match(
        self,
        artifact_name: str,
        description: str,
        artifact_records: list[dict[str, str]],
        mapping_rules: list[dict[str, str]],
        diagnostics: Diagnostics,
    ):
        """Keep mapping failures non-fatal so the API can still explain abstention."""
        try:
            return self.mapping_service.select_best_artifact(
                input_artifact=artifact_name,
                artifact_records=artifact_records,
                mapping_rules=mapping_rules,
                description=description,
            )
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"Artifact mapping failed: {exc}")
            return self.mapping_service.select_best_artifact(
                input_artifact=artifact_name,
                artifact_records=[],
                mapping_rules=[],
                description=description,
            )

    def _safe_persist_best_match(self, artifact_name: str, best_match, diagnostics: Diagnostics) -> str:
        """Persist graph state when possible, but never let it block analysis."""
        try:
            return self.mapping_service.persist_best_match(artifact_name, best_match)
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"BEST_MATCH persistence failed: {exc}")
            return "BEST_MATCH persistence was skipped because persistence failed."

    def _safe_reasoning(
        self,
        matched_artifact: str | None,
        diagnostics: Diagnostics,
    ) -> tuple[list[str], list[str], list[str]]:
        """Reasoning is optional enrichment; failures should degrade to empty graph signals."""
        if not matched_artifact:
            return [], [], []
        try:
            reasoning = self.reasoning_service.fetch_reasoning_summary(matched_artifact)
            return (
                reasoning.get("direct_attacks", []),
                reasoning.get("direct_tactics", []),
                reasoning.get("next_tactics", []),
            )
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"Graph reasoning failed: {exc}")
            return [], [], []

    def _safe_rank_attacks(
        self,
        matched_artifact: str | None,
        matched_category: str | None,
        direct_attacks: list[str],
        mapping_rules: list[dict[str, str]],
        diagnostics: Diagnostics,
    ):
        """ML ranking is downstream of mapping and reasoning, so partial failures abstain safely."""
        try:
            return self.ml_service.rank_attacks(
                matched_artifact=matched_artifact,
                matched_category=matched_category,
                direct_attacks=direct_attacks,
                mapping_rules=mapping_rules,
            )
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"ML ranking failed: {exc}")
            return [], ["ML ranking returned no predictions because the ranking stage failed."]

    def _safe_build_defenses(
        self,
        matched_artifact: str | None,
        direct_attacks: list[str],
        direct_tactics: list[str],
        next_tactics: list[str],
        predictions_available: bool,
        diagnostics: Diagnostics,
    ):
        """Defense suggestions are useful enrichment, not a hard dependency for the API."""
        try:
            return self.defense_service.build_suggestions(
                matched_artifact,
                direct_attacks=direct_attacks,
                direct_tactics=direct_tactics,
                next_tactics=next_tactics,
                predictions_available=predictions_available,
            )
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"Defense suggestion generation failed: {exc}")
            return []

    def _collect_abstention_reasons(
        self,
        confidence_score: float,
        matched_artifact: str | None,
        graph_signals: bool,
        predictions,
    ) -> list[str]:
        """Collect explicit abstention reasons for UI-friendly explanation."""
        reasons: list[str] = []

        if not matched_artifact:
            reasons.append("No artifact could be resolved from the provided input.")

        if confidence_score < self.settings.low_confidence_threshold:
            reasons.append(
                f"Mapping confidence {confidence_score:.2f} is below the abstention threshold "
                f"{self.settings.low_confidence_threshold:.2f}."
            )

        if not graph_signals:
            reasons.append("Graph reasoning returned weak or no supporting signals.")

        if not predictions:
            reasons.append("The ML layer did not produce reliable attack rankings.")
        elif float(predictions[0].probability) < self.settings.strict_prediction_threshold:
            reasons.append(
                f"Top ML probability {predictions[0].probability:.2f} is below the strict prediction "
                f"threshold {self.settings.strict_prediction_threshold:.2f}."
            )

        return reasons

    @staticmethod
    def _format_abstention_reason(reasons: list[str]) -> str | None:
        """Turn structured abstention reasons into a compact UI-facing explanation."""
        return " ".join(reasons) if reasons else None


@lru_cache
def get_analysis_service() -> AnalysisService:
    """Build the dependency graph for request handling."""
    neo4j_client = Neo4jClient()
    return AnalysisService(
        mapping_service=MappingService(neo4j_client=neo4j_client),
        reasoning_service=ReasoningService(neo4j_client=neo4j_client),
        ml_service=MLService(),
        defense_service=DefenseService(neo4j_client=neo4j_client),
    )
