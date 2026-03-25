"""Knowledge-graph reasoning operations integrated from the uploaded package."""

from __future__ import annotations

from app.db.neo4j_client import Neo4jClient


class ReasoningService:
    """Query direct attacks, direct tactics, and next tactics from Neo4j."""

    def __init__(self, neo4j_client: Neo4jClient) -> None:
        self.neo4j_client = neo4j_client

    def get_direct_attacks(self, artifact_name: str) -> list[str]:
        """Return direct attack techniques linked through OFF_REL."""
        rows = self.neo4j_client.fetch_attacks_for_artifact(artifact_name)
        return sorted({str(row.get("attack", "")).strip() for row in rows if row.get("attack")})

    def get_direct_tactics(self, artifact_name: str) -> list[str]:
        """Return direct tactics inferred from graph-linked techniques."""
        rows = self.neo4j_client.fetch_direct_tactics_for_artifact(artifact_name)
        return sorted({str(row.get("tactic", "")).strip() for row in rows if row.get("tactic")})

    def get_next_tactics(self, artifact_name: str) -> list[str]:
        """Return next tactics derived through NEXT_TACTIC edges."""
        rows = self.neo4j_client.fetch_next_tactics_for_artifact(artifact_name)
        return sorted({str(row.get("tactic", "")).strip() for row in rows if row.get("tactic")})

    def fetch_reasoning_summary(self, artifact_name: str) -> dict[str, list[str]]:
        """Bundle the graph reasoning outputs in the shape used by the orchestration layer."""
        return {
            "direct_attacks": self.get_direct_attacks(artifact_name),
            "direct_tactics": self.get_direct_tactics(artifact_name),
            "next_tactics": self.get_next_tactics(artifact_name),
        }
