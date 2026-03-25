"""Defense recommendation service backed by graph-linked defenses."""

from __future__ import annotations

from app.db.neo4j_client import Neo4jClient
from app.schemas.response_models import DefenseSuggestion


class DefenseService:
    """Fetch and format graph-derived defense recommendations."""

    def __init__(self, neo4j_client: Neo4jClient) -> None:
        self.neo4j_client = neo4j_client

    def fetch_candidate_defenses(self, artifact_name: str) -> list[str]:
        """Return distinct defense techniques linked to the matched artifact."""
        rows = self.neo4j_client.fetch_defenses_for_artifact(artifact_name)
        return sorted({str(row.get("defense", "")).strip() for row in rows if row.get("defense")})

    def _fetch_contextual_graph_signals(self, artifact_name: str) -> tuple[list[str], list[str], list[str]]:
        """Collect graph context around the matched artifact.

        This lets the defense layer stay context-aware even when the caller only passes the
        matched artifact, which preserves compatibility with the current orchestration flow.
        """
        direct_attacks = sorted(
            {
                str(row.get("attack", "")).strip()
                for row in self.neo4j_client.fetch_attacks_for_artifact(artifact_name)
                if row.get("attack")
            }
        )
        direct_tactics = sorted(
            {
                str(row.get("tactic", "")).strip()
                for row in self.neo4j_client.fetch_direct_tactics_for_artifact(artifact_name)
                if row.get("tactic")
            }
        )
        next_tactics = sorted(
            {
                str(row.get("tactic", "")).strip()
                for row in self.neo4j_client.fetch_next_tactics_for_artifact(artifact_name)
                if row.get("tactic")
            }
        )
        return direct_attacks, direct_tactics, next_tactics

    @staticmethod
    def _build_context_summary(
        artifact_name: str,
        direct_attacks: list[str],
        direct_tactics: list[str],
        next_tactics: list[str],
        predictions_available: bool | None,
    ) -> str:
        """Summarize what concrete context was actually available.

        We keep this summary factual and bounded to observed graph/runtime state rather than
        inventing mitigation claims that the knowledge graph did not provide.
        """
        summary_parts = [f"Matched artifact: {artifact_name}."]
        if direct_attacks:
            summary_parts.append(f"Direct attacks observed: {len(direct_attacks)}.")
        if direct_tactics:
            summary_parts.append(f"Direct tactics observed: {len(direct_tactics)}.")
        if next_tactics:
            summary_parts.append(f"Next tactics observed: {len(next_tactics)}.")
        if predictions_available is not None:
            summary_parts.append(
                "ML ranking available." if predictions_available else "ML ranking not available."
            )
        return " ".join(summary_parts)

    def _build_fallback_suggestions(
        self,
        artifact_name: str,
        direct_attacks: list[str],
        direct_tactics: list[str],
        next_tactics: list[str],
        predictions_available: bool | None,
    ) -> list[DefenseSuggestion]:
        """Return honest system-level suggestions when defense mapping is incomplete.

        Difference from graph-derived defenses:
        - graph-derived suggestions come directly from `DEF_REL` edges in Neo4j
        - fallback suggestions describe safe next steps for analysts when the graph does not
          yet contain enough mitigation detail for the current artifact context
        """
        context_summary = self._build_context_summary(
            artifact_name=artifact_name,
            direct_attacks=direct_attacks,
            direct_tactics=direct_tactics,
            next_tactics=next_tactics,
            predictions_available=predictions_available,
        )
        suggestions: list[DefenseSuggestion] = []

        if direct_attacks or direct_tactics:
            suggestions.append(
                DefenseSuggestion(
                    title="Validate graph-linked controls",
                    description=(
                        f"{context_summary} Review your real control catalog for the matched artifact "
                        "and the observed attack/tactic set before operationalizing a mitigation decision."
                    ),
                    source="system_context_fallback",
                )
            )

        if next_tactics:
            suggestions.append(
                DefenseSuggestion(
                    title="Prepare next-stage monitoring",
                    description=(
                        f"{context_summary} Extend detection and review coverage to the next tactics "
                        "indicated by the graph so follow-on activity can be checked explicitly."
                    ),
                    source="system_context_fallback",
                )
            )

        if predictions_available is False:
            suggestions.append(
                DefenseSuggestion(
                    title="Treat output as analyst-assisted context",
                    description=(
                        f"{context_summary} Because ranked attack predictions were not available, "
                        "use the artifact and graph context as triage support rather than as a final recommendation."
                    ),
                    source="system_context_fallback",
                )
            )

        if not suggestions:
            suggestions.append(
                DefenseSuggestion(
                    title="Complete defense mapping coverage",
                    description=(
                        f"{context_summary} No graph-derived defenses were available. Add or validate "
                        "artifact-to-defense relationships in Neo4j to enable concrete recommendations here."
                    ),
                    source="system_context_fallback",
                )
            )

        return suggestions

    def build_suggestions(
        self,
        artifact_name: str | None,
        direct_attacks: list[str] | None = None,
        direct_tactics: list[str] | None = None,
        next_tactics: list[str] | None = None,
        predictions_available: bool | None = None,
    ) -> list[DefenseSuggestion]:
        """Convert defense context into API response entries.

        Integration note: the uploaded package returned plain defense names; we preserve the real
        graph-derived values and wrap them in the existing response schema. If graph defense data
        is incomplete, we return clearly labeled fallback/system-level suggestions instead of
        fabricating unsupported cybersecurity facts.
        """
        if not artifact_name:
            return []

        # Preserve compatibility with the current analysis flow by deriving context from Neo4j
        # when the caller does not yet pass the richer reasoning outputs explicitly.
        if direct_attacks is None or direct_tactics is None or next_tactics is None:
            derived_attacks, derived_tactics, derived_next_tactics = self._fetch_contextual_graph_signals(
                artifact_name
            )
            direct_attacks = direct_attacks if direct_attacks is not None else derived_attacks
            direct_tactics = direct_tactics if direct_tactics is not None else derived_tactics
            next_tactics = next_tactics if next_tactics is not None else derived_next_tactics

        defenses = self.fetch_candidate_defenses(artifact_name)
        graph_suggestions = [
            DefenseSuggestion(
                title=defense,
                description=(
                    f"Graph-derived defense candidate linked to artifact '{artifact_name}'. "
                    f"Related attacks: {len(direct_attacks or [])}, direct tactics: {len(direct_tactics or [])}, "
                    f"next tactics: {len(next_tactics or [])}."
                ),
                source="neo4j_def_rel",
            )
            for defense in defenses
        ]

        if graph_suggestions:
            return graph_suggestions

        return self._build_fallback_suggestions(
            artifact_name=artifact_name,
            direct_attacks=direct_attacks or [],
            direct_tactics=direct_tactics or [],
            next_tactics=next_tactics or [],
            predictions_available=predictions_available,
        )
