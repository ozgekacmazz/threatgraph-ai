"""Knowledge-graph reasoning operations integrated from the uploaded package."""

from __future__ import annotations

import logging

from app.db.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


class ReasoningService:
    """Query direct attacks, direct tactics, and next tactics from Neo4j."""

    def __init__(self, neo4j_client: Neo4jClient) -> None:
        self.neo4j_client = neo4j_client

    @staticmethod
    def _normalize_unique_values(rows: list[dict[str, object]], key: str) -> list[str]:
        """Normalize string values from Neo4j rows into a sorted unique list."""
        return sorted({str(row.get(key, "")).strip() for row in rows if row.get(key)})

    def get_direct_attacks(self, artifact_name: str) -> list[str]:
        """Return direct attack techniques linked through OFF_REL."""
        rows = self.neo4j_client.fetch_attacks_for_artifact(artifact_name)
        return self._normalize_unique_values(rows, "attack")

    def resolve_attack(self, attack_name: str) -> str | None:
        """Resolve attack/technique names using Neo4j-backed exact/normalized lookup."""
        rows = self.neo4j_client.fetch_attack_by_name(attack_name)
        attacks = self._normalize_unique_values(rows, "attack")
        return attacks[0] if attacks else None

    def get_direct_tactics(self, artifact_name: str) -> list[str]:
        """Return direct tactics inferred from graph-linked techniques."""
        rows = self.neo4j_client.fetch_direct_tactics_for_artifact(artifact_name)
        return self._normalize_unique_values(rows, "tactic")

    def get_may_impact_artifacts(self, artifact_name: str) -> list[str]:
        """Return one-hop MAY_IMPACT artifacts as additive enrichment only."""
        rows = self.neo4j_client.fetch_may_impact_artifacts_for_artifact(artifact_name)
        return self._normalize_unique_values(rows, "artifact")

    def get_may_impact_attacks(self, artifact_name: str) -> list[str]:
        """Return one-hop MAY_IMPACT attacks as additive enrichment only."""
        rows = self.neo4j_client.fetch_may_impact_attacks_for_artifact(artifact_name)
        attacks = self._normalize_unique_values(rows, "attack")
        if not attacks:
            summary = self.neo4j_client.fetch_may_impact_summary_for_artifact(artifact_name)
            logger.info(
                "MAY_IMPACT enrichment returned no attacks for artifact='%s' (impacted_artifact_count=%s, attack_count=%s).",
                artifact_name,
                summary.get("impacted_artifact_count", 0),
                summary.get("attack_count", 0),
            )
        return attacks

    def get_next_tactics(self, artifact_name: str) -> list[str]:
        """Return next tactics derived through NEXT_TACTIC edges."""
        rows = self.neo4j_client.fetch_next_tactics_for_artifact(artifact_name)
        return self._normalize_unique_values(rows, "tactic")

    def get_artifacts_for_attack(self, attack_name: str) -> list[str]:
        """Return artifacts directly linked to an attack/technique."""
        rows = self.neo4j_client.fetch_artifacts_for_attack(attack_name)
        return self._normalize_unique_values(rows, "artifact")

    def get_direct_tactics_for_attack(self, attack_name: str) -> list[str]:
        """Return direct tactics linked to an attack/technique."""
        rows = self.neo4j_client.fetch_direct_tactics_for_attack(attack_name)
        return self._normalize_unique_values(rows, "tactic")

    def get_next_tactics_for_attack(self, attack_name: str) -> list[str]:
        """Return next tactics linked to an attack/technique context."""
        rows = self.neo4j_client.fetch_next_tactics_for_attack(attack_name)
        return self._normalize_unique_values(rows, "tactic")

    def fetch_reasoning_summary(self, artifact_name: str) -> dict[str, list[str]]:
        """Bundle the graph reasoning outputs in the shape used by the orchestration layer."""
        return {
            "direct_attacks": self.get_direct_attacks(artifact_name),
            "may_impact_artifacts": self.get_may_impact_artifacts(artifact_name),
            "may_impact_attacks": self.get_may_impact_attacks(artifact_name),
            "direct_tactics": self.get_direct_tactics(artifact_name),
            "next_tactics": self.get_next_tactics(artifact_name),
        }

    def fetch_attack_reasoning_summary(self, attack_name: str) -> dict[str, list[str] | str | None]:
        """Bundle attack-centric graph outputs for attack-first scenario analysis."""
        resolved_attack = self.resolve_attack(attack_name)
        if not resolved_attack:
            return {
                "matched_attack": None,
                "related_artifacts": [],
                "direct_tactics": [],
                "next_tactics": [],
            }

        return {
            "matched_attack": resolved_attack,
            "related_artifacts": self.get_artifacts_for_attack(resolved_attack),
            "direct_tactics": self.get_direct_tactics_for_attack(resolved_attack),
            "next_tactics": self.get_next_tactics_for_attack(resolved_attack),
        }
