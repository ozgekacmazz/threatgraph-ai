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
    ExplanationSection,
    GraphContextResponse,
    GraphEdge,
    GraphFocus,
    GraphNode,
)
from app.services.attack_alias_service import AttackAliasService
from app.services.defense_service import DefenseService
from app.services.explanation_service import ExplanationService
from app.services.mapping_service import MappingService
from app.services.ml_service import MLService
from app.services.query_interpreter_service import QueryInterpreterService
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
        query_interpreter_service: QueryInterpreterService,
        explanation_service: ExplanationService,
    ) -> None:
        self.settings = get_settings()
        self.mapping_service = mapping_service
        self.reasoning_service = reasoning_service
        self.ml_service = ml_service
        self.defense_service = defense_service
        self.query_interpreter_service = query_interpreter_service
        self.explanation_service = explanation_service

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
        interpretation = self.query_interpreter_service.interpret(
            artifact_name=artifact_name,
            description=safe_description,
        )
        normalized_artifact, normalized_description = self.mapping_service.normalize_inputs(
            interpretation.normalized_artifact,
            interpretation.enriched_text,
        )
        diagnostics = Diagnostics(
            original_artifact=interpretation.original_artifact,
            original_description=interpretation.original_description,
            normalized_artifact=normalized_artifact,
            normalized_description=normalized_description,
            multilingual_keywords=interpretation.canonical_keywords,
            turkish_synonym_expansion_used=interpretation.turkish_terms_detected,
            english_synonym_expansion_used=interpretation.english_terms_detected,
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
                "multilingual_keyword_count": str(len(interpretation.canonical_keywords)),
                "graph_signals_found": "false",
                "ml_candidate_count": "0",
                "abstention_triggered": "false",
            },
        )
        diagnostics.processing_steps.append("interpret_multilingual_input")

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
            description=interpretation.enriched_text,
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

        direct_attacks, may_impact_artifacts, may_impact_attacks, direct_tactics, next_tactics = self._safe_reasoning(
            matched_artifact=best_match.matched_artifact,
            diagnostics=diagnostics,
        )
        diagnostics.processing_steps.append("fetch_reasoning_summary")
        diagnostics.data_sources["graph_signals_found"] = str(
            bool(
                direct_attacks
                or may_impact_artifacts
                or may_impact_attacks
                or direct_tactics
                or next_tactics
            )
        ).lower()
        diagnostics.data_sources["direct_attack_count"] = str(len(direct_attacks))
        diagnostics.data_sources["may_impact_artifact_count"] = str(len(may_impact_artifacts))
        diagnostics.data_sources["may_impact_attack_count"] = str(len(may_impact_attacks))
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

        response = AnalyzeResponse(
            input_artifact=artifact_name,
            matched_artifact=best_match.matched_artifact,
            matched_category=best_match.matched_category,
            mapping_method=best_match.mapping_method,
            confidence_score=round(best_match.confidence_score, 4),
            confidence_label=confidence_to_label(best_match.confidence_score),
            direct_attacks=direct_attacks,
            may_impact_artifacts=may_impact_artifacts,
            may_impact_attacks=may_impact_attacks,
            direct_tactics=direct_tactics,
            next_tactics=next_tactics,
            predicted_attacks_top5=predicted_attacks[:5],
            defense_suggestions=defense_suggestions,
            low_confidence_reason=low_confidence_reason,
            diagnostics=diagnostics,
        )
        self._attach_explanation(response)
        return response

    def analyze_scenario(self, text: str) -> AnalyzeResponse:
        """Interpret a free-text scenario and run it through the existing analysis pipeline."""
        scenario = self.query_interpreter_service.interpret_scenario(text)
        extracted_artifacts = [
            str(artifact).strip() for artifact in scenario.get("artifacts", []) if str(artifact).strip()
        ]
        extracted_attacks = [
            str(attack).strip() for attack in scenario.get("attacks", []) if str(attack).strip()
        ]
        extracted_keywords = [
            str(keyword).strip() for keyword in scenario.get("keywords", []) if str(keyword).strip()
        ]
        intent = str(scenario.get("intent", "prediction") or "prediction").strip()
        artifact_scores = {
            str(key).strip(): float(value)
            for key, value in dict(scenario.get("artifact_scores", {})).items()
            if str(key).strip()
        }
        attack_scores = {
            str(key).strip(): float(value)
            for key, value in dict(scenario.get("attack_scores", {})).items()
            if str(key).strip()
        }
        csv_matched_attack = str(scenario.get("csv_matched_attack") or "").strip()
        csv_alias_match_used = bool(scenario.get("csv_alias_match_used"))
        csv_alias_confidence = float(scenario.get("csv_alias_confidence") or 0.0)
        analysis_route = str(scenario.get("analysis_route", "artifact_first") or "artifact_first").strip()
        phrase_priority_used = bool(scenario.get("phrase_priority_used"))
        top_candidate_family = str(scenario.get("top_candidate_family") or "").strip()
        identity_access_bias_used = bool(scenario.get("identity_access_bias_used"))
        selected_artifact = self._select_scenario_artifact_candidate(
            text=text,
            extracted_artifacts=extracted_artifacts,
            extracted_keywords=extracted_keywords,
            artifact_scores=artifact_scores,
            identity_access_bias_used=identity_access_bias_used,
        )
        if csv_matched_attack:
            matched_attack = csv_matched_attack
            matched_attack_score = csv_alias_confidence
            attack_lookup_strategy = "csv_alias_match"
            attack_lookup_candidates = [csv_matched_attack]
            attack_alias_used = csv_alias_confidence < 1.0
            attack_fallback_used = False
            attack_alias_fallback_target = None
        else:
            matched_attack, matched_attack_score, attack_lookup_strategy, attack_lookup_candidates, attack_alias_used, attack_fallback_used, attack_alias_fallback_target = self._select_scenario_attack_candidate(
                extracted_attacks=extracted_attacks,
                attack_scores=attack_scores,
            )
        requested_attack_name = extracted_attacks[0] if extracted_attacks else None
        matched_attack_exact = bool(
            matched_attack
            and (csv_alias_match_used or attack_lookup_strategy in {"exact_normalized_equality", "alias_equality"})
        )
        attack_semantic_fallback_used = bool(matched_attack and attack_fallback_used)
        fallback_attack_family = (
            self.query_interpreter_service.get_attack_fallback_family(requested_attack_name or matched_attack or "")
            if attack_semantic_fallback_used
            else None
        )
        fallback_attack_explanation = (
            "Girilen saldiri adi graph'ta dogrudan bulunamadigi icin en yakin saldiri ailesi uzerinden yorum yapildi."
            if attack_semantic_fallback_used
            else None
        )

        if analysis_route in {"attack_first", "hybrid"} and matched_attack:
            response = self._build_attack_driven_scenario_response(
                text=text,
                selected_artifact=selected_artifact,
                matched_attack=matched_attack,
                analysis_route=analysis_route,
                semantic_fallback_used=attack_semantic_fallback_used,
            )
        else:
            response = self.analyze_artifact(
                artifact_name=selected_artifact,
                description=text,
                analysis_mode="new",
            )
            analysis_route = "artifact_first"

        response.extracted_artifacts = extracted_artifacts
        response.extracted_attacks = extracted_attacks
        response.keywords = extracted_keywords
        response.intent = intent
        response.matched_attack = matched_attack
        response.matched_attack_exact = matched_attack_exact
        response.fallback_attack_family = fallback_attack_family
        response.fallback_attack_explanation = fallback_attack_explanation
        response.analysis_route = analysis_route
        response.attack_match_method = "neo4j_attack_lookup" if matched_attack else None
        if attack_semantic_fallback_used:
            response.confidence_score = round(min(response.confidence_score, 0.64), 4)
            response.confidence_label = confidence_to_label(response.confidence_score)
            response.low_confidence_reason = response.low_confidence_reason or (
                "Attack eslesmesi dogrudan graph dugumune degil, yakin bir saldiri ailesine dayanmaktadir."
            )
        response.diagnostics.processing_steps.append("interpret_scenario")
        response.diagnostics.data_sources["scenario_candidate_artifact_count"] = str(
            len(extracted_artifacts)
        )
        response.diagnostics.data_sources["scenario_attack_hint_count"] = str(len(extracted_attacks))
        response.diagnostics.data_sources["scenario_keyword_count"] = str(len(extracted_keywords))
        response.diagnostics.data_sources["scenario_attack_match_used"] = str(bool(matched_attack)).lower()
        response.diagnostics.data_sources["scenario_artifact_match_used"] = str(
            bool(response.matched_artifact)
        ).lower()
        response.diagnostics.data_sources["scenario_analysis_route"] = analysis_route
        response.diagnostics.data_sources["matched_attack_name"] = matched_attack or "none"
        response.diagnostics.data_sources["matched_attack_confidence"] = (
            f"{matched_attack_score:.2f}" if matched_attack_score else "0.00"
        )
        response.diagnostics.data_sources["scenario_csv_alias_match_used"] = str(
            csv_alias_match_used
        ).lower()
        response.diagnostics.data_sources["scenario_csv_alias_confidence"] = f"{csv_alias_confidence:.2f}"
        response.diagnostics.data_sources["scenario_attack_lookup_strategy_used"] = (
            attack_lookup_strategy or "none"
        )
        response.diagnostics.data_sources["scenario_attack_lookup_candidates"] = (
            ", ".join(attack_lookup_candidates) if attack_lookup_candidates else "none"
        )
        response.diagnostics.data_sources["scenario_attack_alias_used"] = str(
            attack_alias_used
        ).lower()
        response.diagnostics.data_sources["scenario_attack_exact_match_used"] = str(
            matched_attack_exact
        ).lower()
        response.diagnostics.data_sources["scenario_attack_alias_match_used"] = str(
            bool(matched_attack and attack_lookup_strategy == "alias_equality")
        ).lower()
        response.diagnostics.data_sources["scenario_attack_semantic_fallback_used"] = str(
            attack_semantic_fallback_used
        ).lower()
        response.diagnostics.data_sources["scenario_attack_fallback_used"] = str(
            attack_fallback_used
        ).lower()
        response.diagnostics.data_sources["scenario_attack_alias_fallback_target"] = (
            attack_alias_fallback_target or "none"
        )
        response.diagnostics.data_sources["scenario_requested_attack_name"] = (
            requested_attack_name or "none"
        )
        response.diagnostics.data_sources["scenario_resolved_attack_name"] = matched_attack or "none"
        response.diagnostics.data_sources["scenario_fallback_attack_family"] = (
            fallback_attack_family or "none"
        )
        response.diagnostics.data_sources["scenario_hybrid_enrichment_used"] = str(
            analysis_route == "hybrid"
        ).lower()
        response.diagnostics.data_sources["scenario_phrase_priority_used"] = str(
            phrase_priority_used
        ).lower()
        response.diagnostics.data_sources["scenario_top_candidate_family"] = (
            top_candidate_family or "unknown"
        )
        response.diagnostics.data_sources["scenario_identity_access_bias_used"] = str(
            identity_access_bias_used
        ).lower()
        if artifact_scores:
            response.diagnostics.warnings.append(
                "Scenario artifact scores: "
                + ", ".join(
                    f"{candidate} ({score:.2f})"
                    for candidate, score in sorted(
                        artifact_scores.items(),
                        key=lambda item: (-item[1], item[0]),
                    )[:5]
                )
            )
        if attack_scores:
            response.diagnostics.warnings.append(
                "Scenario attack scores: "
                + ", ".join(
                    f"{candidate} ({score:.2f})"
                    for candidate, score in sorted(
                        attack_scores.items(),
                        key=lambda item: (-item[1], item[0]),
                    )[:5]
                )
            )
        self._attach_explanation(response, intent=intent)
        return response

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

        direct_attacks, _, _, direct_tactics, next_tactics = self._safe_reasoning(
            matched_artifact=resolved_artifact,
            diagnostics=Diagnostics(
                original_artifact="",
                original_description="",
                normalized_artifact="",
                normalized_description="",
            ),
        )
        defenses = (
            self.defense_service.fetch_candidate_defenses(resolved_artifact)
            if resolved_artifact
            else []
        )
        may_impact_rows = (
            self.reasoning_service.neo4j_client.fetch_may_impact_graph_context_for_artifact(resolved_artifact)
            if resolved_artifact
            else []
        )
        may_impact_attack_rows = (
            self.reasoning_service.neo4j_client.fetch_may_impact_attack_paths_for_artifact(resolved_artifact)
            if resolved_artifact
            else []
        )

        nodes: list[GraphNode] = []
        edges: list[GraphEdge] = []
        node_ids: set[str] = set()
        edge_keys: set[tuple[str, str, str]] = set()
        propagated_attack_limit_per_artifact = 3

        def add_node(node_id: str, label: str, node_type: str) -> None:
            if node_id in node_ids:
                return
            node_ids.add(node_id)
            nodes.append(GraphNode(id=node_id, label=label, type=node_type))

        def add_edge(source: str, target: str, label: str) -> None:
            edge_key = (source, target, label)
            if edge_key in edge_keys:
                return
            edge_keys.add(edge_key)
            edges.append(GraphEdge(source=source, target=target, label=label))

        artifact_node_id = f"artifact:input:{artifact_name}"
        add_node(artifact_node_id, artifact_name, "artifact")

        matched_node_id: str | None = None
        if resolved_artifact:
            matched_node_id = f"artifact:matched:{resolved_artifact}"
            add_node(matched_node_id, resolved_artifact, "artifact")
            if matched_artifact or artifact_name.strip().lower() != resolved_artifact.strip().lower():
                add_edge(artifact_node_id, matched_node_id, "MATCHED_TO")

        focus_artifact_node = matched_node_id or artifact_node_id
        impacted_artifact_node_ids: dict[str, str] = {}
        for row in may_impact_rows:
            impacted_artifact = str(row.get("impacted_artifact", "")).strip()
            if not impacted_artifact:
                continue
            impacted_node_id = f"artifact:impacted:{impacted_artifact}"
            impacted_artifact_node_ids[impacted_artifact] = impacted_node_id
            add_node(impacted_node_id, impacted_artifact, "artifact")
            add_edge(focus_artifact_node, impacted_node_id, "MAY_IMPACT")

        propagated_attack_counts: dict[str, int] = {}
        for row in may_impact_attack_rows:
            impacted_artifact = str(row.get("impacted_artifact", "")).strip()
            attack = str(row.get("attack", "")).strip()
            if not impacted_artifact or not attack:
                continue

            impacted_node_id = impacted_artifact_node_ids.get(impacted_artifact)
            if not impacted_node_id:
                impacted_node_id = f"artifact:impacted:{impacted_artifact}"
                impacted_artifact_node_ids[impacted_artifact] = impacted_node_id
                add_node(impacted_node_id, impacted_artifact, "artifact")
                add_edge(focus_artifact_node, impacted_node_id, "MAY_IMPACT")

            current_count = propagated_attack_counts.get(impacted_artifact, 0)
            if current_count >= propagated_attack_limit_per_artifact:
                continue

            attack_id = f"attack:{attack}"
            add_node(attack_id, attack, "attack")
            add_edge(impacted_node_id, attack_id, "PROPAGATED_ATTACK")
            propagated_attack_counts[impacted_artifact] = current_count + 1

        for attack in direct_attacks:
            attack_id = f"attack:{attack}"
            add_node(attack_id, attack, "attack")
            add_edge(focus_artifact_node, attack_id, "DIRECT_ATTACK")

        direct_tactic_ids: list[str] = []
        for tactic in direct_tactics:
            tactic_id = f"tactic:direct:{tactic}"
            add_node(tactic_id, tactic, "tactic")
            direct_tactic_ids.append(tactic_id)
            if direct_attacks:
                for attack in direct_attacks:
                    add_edge(f"attack:{attack}", tactic_id, "HAS_TACTIC")
            else:
                add_edge(focus_artifact_node, tactic_id, "HAS_TACTIC")

        next_tactic_ids: list[str] = []
        for tactic in next_tactics:
            next_tactic_id = f"tactic:next:{tactic}"
            add_node(next_tactic_id, tactic, "tactic")
            next_tactic_ids.append(next_tactic_id)
            if direct_tactic_ids:
                for direct_tactic_id in direct_tactic_ids:
                    add_edge(direct_tactic_id, next_tactic_id, "NEXT_TACTIC")
            else:
                add_edge(focus_artifact_node, next_tactic_id, "NEXT_TACTIC")

        for defense in defenses:
            defense_id = f"defense:{defense}"
            add_node(defense_id, defense, "defense")
            if next_tactic_ids:
                for next_tactic_id in next_tactic_ids:
                    add_edge(next_tactic_id, defense_id, "DEFENDED_BY")
            elif direct_tactic_ids:
                for direct_tactic_id in direct_tactic_ids:
                    add_edge(direct_tactic_id, defense_id, "DEFENDED_BY")
            else:
                add_edge(focus_artifact_node, defense_id, "DEFENDED_BY")

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
    ) -> tuple[list[str], list[str], list[str], list[str], list[str]]:
        """Reasoning is optional enrichment; failures should degrade to empty graph signals."""
        if not matched_artifact:
            return [], [], [], [], []
        try:
            reasoning = self.reasoning_service.fetch_reasoning_summary(matched_artifact)
            return (
                reasoning.get("direct_attacks", []),
                reasoning.get("may_impact_artifacts", []),
                reasoning.get("may_impact_attacks", []),
                reasoning.get("direct_tactics", []),
                reasoning.get("next_tactics", []),
            )
        except Exception as exc:  # pragma: no cover - defensive orchestration
            diagnostics.warnings.append(f"Graph reasoning failed: {exc}")
            return [], [], [], [], []

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

    def _select_scenario_artifact_candidate(
        self,
        text: str,
        extracted_artifacts: list[str],
        extracted_keywords: list[str],
        artifact_scores: dict[str, float],
        identity_access_bias_used: bool,
        preferred_candidates: list[str] | None = None,
    ) -> str:
        """Pick the most plausible artifact candidate without forcing weak unrelated matches."""
        candidate_pool = list(dict.fromkeys((preferred_candidates or []) + extracted_artifacts))
        selected_artifact = candidate_pool[0] if candidate_pool else ""

        if candidate_pool:
            try:
                artifact_records, mapping_rules = self.mapping_service.fetch_context()
                selected_artifact = max(
                    candidate_pool,
                    key=lambda candidate: (
                        self.mapping_service.select_best_artifact(
                            input_artifact=candidate,
                            artifact_records=artifact_records,
                            mapping_rules=mapping_rules,
                            description=text,
                        ).confidence_score
                        + min(artifact_scores.get(candidate, 0.0) / 10.0, 0.45)
                        + (
                            0.12
                            if identity_access_bias_used
                            and candidate
                            in {"credential", "password", "user account", "domain user account", "identity"}
                            else 0.0
                        )
                    ),
                )
            except Exception:
                selected_artifact = candidate_pool[0]

        if not selected_artifact and extracted_keywords:
            preferred_keywords = [
                keyword
                for keyword in extracted_keywords
                if keyword in {"credential", "password", "user account", "domain user account", "identity"}
            ]
            if identity_access_bias_used and preferred_keywords:
                selected_artifact = preferred_keywords[0]
            else:
                selected_artifact = extracted_keywords[0]

        return selected_artifact or text.strip()

    def _select_scenario_attack_candidate(
        self,
        extracted_attacks: list[str],
        attack_scores: dict[str, float],
    ) -> tuple[str | None, float, str | None, list[str], bool, bool, str | None]:
        """Resolve the strongest attack candidate through Neo4j-backed technique lookup."""
        best_attack: str | None = None
        best_score = 0.0
        best_strategy: str | None = None
        best_candidates: list[str] = []
        alias_used = False
        fallback_used = False
        fallback_target: str | None = None

        for candidate in extracted_attacks:
            rows = self.reasoning_service.neo4j_client.fetch_attack_by_name(candidate)
            resolved_via_fallback = False
            candidate_fallback_target: str | None = None
            if not rows:
                candidate_fallback_target = self.query_interpreter_service.get_attack_fallback_target(candidate)
                if candidate_fallback_target:
                    rows = self.reasoning_service.neo4j_client.fetch_attack_by_name(candidate_fallback_target)
                    resolved_via_fallback = bool(rows)
            if not rows:
                continue
            resolved_attack = str(rows[0].get("attack", "")).strip()
            if not resolved_attack:
                continue
            candidate_score = float(attack_scores.get(candidate, 0.0))
            if resolved_via_fallback:
                candidate_score *= 0.82
            if candidate_score > best_score:
                best_attack = resolved_attack
                best_score = candidate_score
                best_strategy = (
                    "alias_fallback_to_related_attack"
                    if resolved_via_fallback
                    else str(rows[0].get("lookup_strategy", "")).strip() or None
                )
                best_candidates = [
                    str(row.get("attack", "")).strip()
                    for row in rows
                    if str(row.get("attack", "")).strip()
                ]
                alias_used = str(rows[0].get("alias_used", "false")).strip().lower() == "true"
                fallback_used = resolved_via_fallback
                fallback_target = candidate_fallback_target if resolved_via_fallback else None

        return best_attack, best_score, best_strategy, best_candidates, alias_used, fallback_used, fallback_target

    def _build_attack_driven_scenario_response(
        self,
        text: str,
        selected_artifact: str,
        matched_attack: str,
        analysis_route: str,
        semantic_fallback_used: bool = False,
    ) -> AnalyzeResponse:
        """Build scenario responses when an attack/technique is the semantic anchor."""
        attack_summary = self.reasoning_service.fetch_attack_reasoning_summary(matched_attack)
        related_artifacts = [
            str(artifact).strip()
            for artifact in attack_summary.get("related_artifacts", [])
            if str(artifact).strip()
        ]
        direct_tactics = [
            str(tactic).strip()
            for tactic in attack_summary.get("direct_tactics", [])
            if str(tactic).strip()
        ]
        next_tactics = [
            str(tactic).strip()
            for tactic in attack_summary.get("next_tactics", [])
            if str(tactic).strip()
        ]
        artifact_anchor = self._select_scenario_artifact_candidate(
            text=text,
            extracted_artifacts=[],
            extracted_keywords=related_artifacts,
            artifact_scores={artifact: 1.0 for artifact in related_artifacts},
            identity_access_bias_used=False,
            preferred_candidates=related_artifacts if analysis_route == "attack_first" else [selected_artifact] + related_artifacts if selected_artifact else related_artifacts,
        )

        base_response: AnalyzeResponse | None = None
        if analysis_route == "hybrid" and selected_artifact:
            base_response = self.analyze_artifact(
                artifact_name=selected_artifact,
                description=text,
                analysis_mode="new",
            )
        elif artifact_anchor and artifact_anchor != text.strip():
            base_response = self.analyze_artifact(
                artifact_name=artifact_anchor,
                description=text,
                analysis_mode="new",
            )

        if base_response is None:
            diagnostics = Diagnostics(
                original_artifact="",
                original_description=text,
                normalized_artifact="",
                normalized_description=self.mapping_service.normalize_artifact_text(text),
                thresholds={
                    "low_confidence_threshold": self.settings.low_confidence_threshold,
                    "strict_prediction_threshold": self.settings.strict_prediction_threshold,
                },
                processing_steps=["interpret_scenario", "resolve_attack_first_context"],
                data_sources={
                    "analysis_mode": "new",
                    "scenario_analysis_route": analysis_route,
                },
            )
            matched_artifact = related_artifacts[0] if len(related_artifacts) == 1 else None
            defense_suggestions = self._safe_build_defenses(
                matched_artifact=matched_artifact,
                direct_attacks=[matched_attack],
                direct_tactics=direct_tactics,
                next_tactics=next_tactics,
                predictions_available=False,
                diagnostics=diagnostics,
            )
            return AnalyzeResponse(
                input_artifact=text,
                matched_artifact=matched_artifact,
                matched_category=None,
                mapping_method="attack_technique_lookup",
                confidence_score=0.0,
                confidence_label=confidence_to_label(0.0),
                direct_attacks=[matched_attack],
                may_impact_artifacts=related_artifacts,
                may_impact_attacks=[],
                direct_tactics=direct_tactics,
                next_tactics=next_tactics,
                predicted_attacks_top5=[],
                defense_suggestions=defense_suggestions,
                low_confidence_reason=(
                    "Attack-centric scenario used an approximate attack-family interpretation."
                    if semantic_fallback_used
                    else None if matched_attack else "Attack-centric scenario could not be resolved reliably."
                ),
                diagnostics=diagnostics,
            )

        base_response.mapping_method = "attack_technique_lookup"
        base_response.direct_attacks = sorted(set(base_response.direct_attacks + [matched_attack]))
        base_response.direct_tactics = sorted(set(base_response.direct_tactics + direct_tactics))
        base_response.next_tactics = sorted(set(base_response.next_tactics + next_tactics))
        base_response.may_impact_artifacts = sorted(
            set(base_response.may_impact_artifacts + related_artifacts)
        )
        if analysis_route == "attack_first" and not base_response.matched_artifact:
            base_response.matched_artifact = related_artifacts[0] if len(related_artifacts) == 1 else None
        if analysis_route == "attack_first" and base_response.confidence_score < self.settings.low_confidence_threshold:
            base_response.low_confidence_reason = base_response.low_confidence_reason or (
                "Attack-centric route resolved the technique, but artifact evidence remained limited."
            )
        if semantic_fallback_used:
            base_response.low_confidence_reason = base_response.low_confidence_reason or (
                "Attack-centric route used a nearby attack family instead of an exact graph technique."
            )
        return base_response

    def _attach_explanation(self, response: AnalyzeResponse, intent: str | None = None) -> None:
        """Add a deterministic Turkish explanation layer on top of the structured result."""
        explanation = self.explanation_service.build_analysis_explanation(
            response,
            intent=intent or response.intent,
        )
        response.explanation_title = str(explanation.get("summary_title") or "").strip() or None
        response.explanation_text = str(explanation.get("summary_text") or "").strip() or None
        response.explanation_sections = [
            ExplanationSection(**section)
            for section in explanation.get("summary_sections", [])
            if isinstance(section, dict)
        ]


@lru_cache
def get_analysis_service() -> AnalysisService:
    """Build the dependency graph for request handling."""
    neo4j_client = Neo4jClient()
    attack_alias_service = AttackAliasService()
    return AnalysisService(
        mapping_service=MappingService(neo4j_client=neo4j_client),
        reasoning_service=ReasoningService(neo4j_client=neo4j_client),
        ml_service=MLService(),
        defense_service=DefenseService(neo4j_client=neo4j_client),
        query_interpreter_service=QueryInterpreterService(attack_alias_service=attack_alias_service),
        explanation_service=ExplanationService(),
    )
