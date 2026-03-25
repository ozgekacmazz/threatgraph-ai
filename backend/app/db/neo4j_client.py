"""Neo4j access layer with production-oriented helper methods."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

try:
    from neo4j import GraphDatabase
except ImportError:  # pragma: no cover - optional dependency at authoring time
    GraphDatabase = None


class Neo4jClient:
    """Graph client used by mapping, reasoning, and defense services."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._driver = None
        self._connection_error: str | None = None
        self._initialize_driver()

    def _initialize_driver(self) -> None:
        """Initialize and validate the Neo4j driver without crashing the app."""
        if GraphDatabase is None:
            logger.warning("Neo4j driver package is not installed. Graph features will be disabled.")
            return

        missing_fields = [
            setting_name
            for setting_name, setting_value in {
                "NEO4J_URI": self.settings.neo4j_uri,
                "NEO4J_USERNAME": self.settings.neo4j_username,
                "NEO4J_PASSWORD": self.settings.neo4j_password,
            }.items()
            if not setting_value
        ]
        if missing_fields:
            logger.warning(
                "Neo4j driver not initialized because required settings are missing: %s. "
                "Expected env file: %s. Graph lookups will return empty results.",
                ", ".join(missing_fields),
                self.settings.env_file_path,
            )
            return

        driver = None
        try:
            logger.info(
                "Initializing Neo4j driver from %s for uri '%s' and database '%s'.",
                self.settings.env_file_path,
                self.settings.neo4j_uri,
                self.settings.neo4j_database,
            )
            driver = GraphDatabase.driver(
                self.settings.neo4j_uri,
                auth=(self.settings.neo4j_username, self.settings.neo4j_password),
            )
            driver.verify_connectivity()
            self._driver = driver
            logger.info(
                "Neo4j connection established successfully for database '%s'.",
                self.settings.neo4j_database,
            )
        except Exception as exc:  # pragma: no cover - depends on external service availability
            self._connection_error = str(exc)
            if driver is not None:
                driver.close()
            logger.warning(
                "Neo4j connection failed for uri '%s' and database '%s': %s. "
                "Graph features will be disabled, but the API will keep running.",
                self.settings.neo4j_uri,
                self.settings.neo4j_database,
                exc,
            )

    def close(self) -> None:
        """Close the driver when the application shuts down."""
        if self._driver:
            self._driver.close()

    def is_available(self) -> bool:
        """Expose whether live graph access is configured."""
        return self._driver is not None

    @property
    def connection_error(self) -> str | None:
        """Expose the latest connection error for health and startup reporting."""
        return self._connection_error

    def run_query(self, query: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Execute a Cypher query or return an empty list when unavailable."""
        if not self._driver:
            return []

        try:
            with self._driver.session(database=self.settings.neo4j_database) as session:
                result = session.run(query, parameters or {})
                return [record.data() for record in result]
        except Exception as exc:  # pragma: no cover - depends on external service availability
            logger.warning(
                "Neo4j query execution failed for database '%s': %s. Returning an empty result set.",
                self.settings.neo4j_database,
                exc,
            )
            return []

    def fetch_artifacts(self) -> list[dict[str, Any]]:
        """Fetch canonical artifact names and categories used for live matching."""
        query = """
        MATCH (a:Artifact)
        RETURN DISTINCT
            a.name AS artifact,
            coalesce(a.category, "Unknown") AS category
        ORDER BY artifact
        """
        return self.run_query(query)

    def ensure_new_artifact_node(self, artifact_name: str) -> dict[str, Any]:
        """Create or update the transient NewArtifact node used by the original pipeline."""
        query = """
        MERGE (n:NewArtifact {name: $artifact_name})
        ON CREATE SET n.created_at = datetime()
        SET n.last_seen_at = datetime()
        RETURN n.name AS artifact
        """
        rows = self.run_query(query, {"artifact_name": artifact_name})
        return rows[0] if rows else {"artifact": artifact_name}

    def fetch_new_artifact_best_match(self, artifact_name: str) -> dict[str, Any] | None:
        """Reuse an existing BEST_MATCH relation when the graph already stores one."""
        query = """
        MATCH (n:NewArtifact {name: $artifact_name})-[r:BEST_MATCH]->(a:Artifact)
        RETURN
            a.name AS artifact,
            coalesce(a.category, "Unknown") AS category,
            properties(r) AS relation_properties
        ORDER BY a.name ASC
        LIMIT 1
        """
        rows = self.run_query(query, {"artifact_name": artifact_name})
        return rows[0] if rows else None

    def create_or_update_best_match(
        self,
        artifact_name: str,
        matched_artifact: str,
        score: float,
        method: str,
    ) -> dict[str, Any] | None:
        """Persist the selected BEST_MATCH relation for auditability and later reuse."""
        query = """
        MATCH (a:Artifact {name: $matched_artifact})
        MERGE (n:NewArtifact {name: $artifact_name})
        ON CREATE SET n.created_at = datetime()
        SET n.last_seen_at = datetime()
        WITH n, a
        OPTIONAL MATCH (n)-[old:BEST_MATCH]->(:Artifact)
        FOREACH (rel IN CASE WHEN old IS NULL THEN [] ELSE [old] END | DELETE rel)
        WITH n, a
        MERGE (n)-[r:BEST_MATCH]->(a)
        SET
            r.score = $score,
            r.method = $method,
            r.updated_at = datetime()
        RETURN
            n.name AS new_artifact,
            a.name AS matched_artifact,
            coalesce(a.category, "Unknown") AS category,
            r.score AS score,
            r.method AS method
        """
        rows = self.run_query(
            query,
            {
                "artifact_name": artifact_name,
                "matched_artifact": matched_artifact,
                "score": float(score),
                "method": method,
            },
        )
        return rows[0] if rows else None

    def fetch_mapping_rules(self) -> list[dict[str, Any]]:
        """Fetch weighted MappingRule nodes used by the existing hybrid matcher."""
        query = """
        MATCH (r:MappingRule)
        RETURN DISTINCT
            coalesce(r.keyword, "") AS keyword,
            coalesce(r.target_artifact, "") AS target_artifact,
            coalesce(r.rule_type, "token") AS rule_type,
            coalesce(r.weight, 0.0) AS weight,
            coalesce(r.source, "Unknown") AS source
        ORDER BY target_artifact, keyword
        """
        return self.run_query(query)

    def fetch_attacks_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch direct attack techniques for the matched artifact."""
        query = """
        MATCH (o:OffenseTech)-[:OFF_REL]->(a:Artifact {name: $artifact_name})
        RETURN DISTINCT o.name AS attack
        ORDER BY attack
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_direct_tactics_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch direct tactics from ATT&CK technique relationships."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})<-[:OFF_REL]-(o:OffenseTech)
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
        RETURN DISTINCT t.name AS tactic
        ORDER BY tactic
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_next_tactics_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch next tactics reachable from the matched artifact's direct tactics."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})<-[:OFF_REL]-(o:OffenseTech)
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
        MATCH (t)-[:NEXT_TACTIC]->(nt:Tactic)
        RETURN DISTINCT nt.name AS tactic
        ORDER BY tactic
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_defenses_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch graph-linked defense techniques for a matched artifact."""
        query = """
        MATCH (d:DefenseTech)-[:DEF_REL]->(a:Artifact {name: $artifact_name})
        RETURN DISTINCT d.name AS defense
        ORDER BY defense
        """
        return self.run_query(query, {"artifact_name": artifact_name})
