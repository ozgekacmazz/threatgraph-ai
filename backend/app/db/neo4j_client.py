"""Neo4j access layer with production-oriented helper methods."""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
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

    def fetch_attack_by_name(self, attack_name: str) -> list[dict[str, Any]]:
        """Resolve attack names with staged exact, normalized, alias, and contains matching."""
        normalized = self._normalize_attack_lookup_name(attack_name)
        if not normalized:
            return []

        alias = self._expand_attack_lookup_alias(normalized)
        search_terms = [normalized]
        if alias != normalized:
            search_terms.append(alias)

        exact_query = """
        MATCH (o:OffenseTech)
        WHERE toLower(coalesce(o.name, "")) IN $search_terms
        RETURN DISTINCT o.name AS attack
        LIMIT 20
        """
        exact_rows = self.run_query(exact_query, {"search_terms": search_terms})
        ranked_exact = self._rank_attack_lookup_candidates(
            attack_name=normalized,
            alias_name=alias,
            rows=exact_rows,
        )
        if ranked_exact:
            return ranked_exact

        tokens = sorted({token for term in search_terms for token in term.split() if len(token) >= 4})
        fallback_query = """
        MATCH (o:OffenseTech)
        WITH DISTINCT o.name AS attack, toLower(coalesce(o.name, "")) AS lower_name
        WHERE any(token IN $tokens WHERE lower_name CONTAINS token)
           OR any(term IN $search_terms WHERE lower_name CONTAINS term OR term CONTAINS lower_name)
        RETURN attack
        LIMIT 50
        """
        fallback_rows = self.run_query(
            fallback_query,
            {"tokens": tokens, "search_terms": search_terms},
        )
        return self._rank_attack_lookup_candidates(
            attack_name=normalized,
            alias_name=alias,
            rows=fallback_rows,
        )

    @staticmethod
    def _normalize_attack_lookup_name(value: str | None) -> str:
        normalized = str(value or "").strip().lower()
        normalized = normalized.replace("-", " ").replace("_", " ")
        normalized = normalized.replace('"', " ").replace("'", " ")
        normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized)
        return normalized.strip()

    @staticmethod
    def _expand_attack_lookup_alias(value: str) -> str:
        aliases = {
            "pass-the-hash": "pass the hash",
            "pass the hash": "pass the hash",
            "network sniffing": "network sniffing",
            "sniffing": "network sniffing",
            "browser session hijacking": "session hijacking",
            "credential theft": "credential theft",
        }
        return aliases.get(value, value)

    def _rank_attack_lookup_candidates(
        self,
        attack_name: str,
        alias_name: str,
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Rank attack candidates deterministically and keep weak unrelated matches out."""
        ranked_rows: list[dict[str, Any]] = []

        for row in rows:
            attack = str(row.get("attack", "")).strip()
            if not attack:
                continue

            normalized_candidate = self._normalize_attack_lookup_name(attack)
            strategy = ""
            score = 0.0

            if normalized_candidate == attack_name:
                strategy = "exact_normalized_equality"
                score = 1.0
            elif normalized_candidate == alias_name:
                strategy = "alias_equality"
                score = 0.97
            elif attack_name in normalized_candidate or normalized_candidate in attack_name:
                strategy = "contains_match"
                score = 0.82
            elif alias_name in normalized_candidate or normalized_candidate in alias_name:
                strategy = "alias_contains_match"
                score = 0.8
            else:
                similarity = SequenceMatcher(None, alias_name, normalized_candidate).ratio()
                token_overlap = len(set(alias_name.split()) & set(normalized_candidate.split()))
                if token_overlap >= 1 and similarity >= 0.58:
                    strategy = "close_candidate_match"
                    score = round(similarity, 4)

            if not strategy:
                continue

            ranked_rows.append(
                {
                    "attack": attack,
                    "lookup_strategy": strategy,
                    "alias_used": str(alias_name != attack_name).lower(),
                    "lookup_score": score,
                }
            )

        ranked_rows.sort(
            key=lambda item: (-float(item.get("lookup_score", 0.0)), str(item.get("attack", "")).lower())
        )
        return ranked_rows[:5]

    def fetch_artifacts_for_attack(self, attack_name: str) -> list[dict[str, Any]]:
        """Fetch artifacts directly linked to an attack/technique."""
        query = """
        MATCH (o:OffenseTech {name: $attack_name})-[:OFF_REL]->(a:Artifact)
        RETURN DISTINCT
            a.name AS artifact,
            coalesce(a.category, "Unknown") AS category
        ORDER BY artifact
        """
        return self.run_query(query, {"attack_name": attack_name})

    def fetch_direct_tactics_for_attack(self, attack_name: str) -> list[dict[str, Any]]:
        """Fetch direct tactics for an attack/technique."""
        query = """
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o:OffenseTech {name: $attack_name})
        RETURN DISTINCT t.name AS tactic
        ORDER BY tactic
        """
        return self.run_query(query, {"attack_name": attack_name})

    def fetch_next_tactics_for_attack(self, attack_name: str) -> list[dict[str, Any]]:
        """Fetch next tactics reachable from an attack/technique."""
        query = """
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o:OffenseTech {name: $attack_name})
        MATCH (t)-[:NEXT_TACTIC]->(nt:Tactic)
        RETURN DISTINCT nt.name AS tactic
        ORDER BY tactic
        """
        return self.run_query(query, {"attack_name": attack_name})

    def fetch_direct_tactics_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch direct tactics from ATT&CK technique relationships."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})<-[:OFF_REL]-(o:OffenseTech)
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
        RETURN DISTINCT t.name AS tactic
        ORDER BY tactic
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_may_impact_artifacts_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch one-hop MAY_IMPACT artifact neighbors for optional enrichment."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})-[:MAY_IMPACT]->(b:Artifact)
        RETURN DISTINCT b.name AS artifact
        ORDER BY artifact
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_may_impact_graph_context_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch source and impacted artifacts for graph-context expansion."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})-[:MAY_IMPACT]->(b:Artifact)
        RETURN DISTINCT
            a.name AS source_artifact,
            b.name AS impacted_artifact
        ORDER BY impacted_artifact
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_may_impact_attacks_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch one-hop MAY_IMPACT attack techniques for optional enrichment."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})-[:MAY_IMPACT]->(b:Artifact)<-[:OFF_REL]-(o:OffenseTech)
        RETURN DISTINCT o.name AS attack
        ORDER BY attack
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_may_impact_attack_paths_for_artifact(self, artifact_name: str) -> list[dict[str, Any]]:
        """Fetch impacted artifacts and their reachable attacks for graph-context expansion."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})-[:MAY_IMPACT]->(b:Artifact)<-[:OFF_REL]-(o:OffenseTech)
        RETURN DISTINCT
            a.name AS source_artifact,
            b.name AS impacted_artifact,
            o.name AS attack
        ORDER BY impacted_artifact, attack
        """
        return self.run_query(query, {"artifact_name": artifact_name})

    def fetch_may_impact_summary_for_artifact(self, artifact_name: str) -> dict[str, Any]:
        """Return MAY_IMPACT debug counts for safe observability."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})
        OPTIONAL MATCH (a)-[:MAY_IMPACT]->(b:Artifact)
        WITH collect(DISTINCT b) AS impacted_artifacts
        UNWIND CASE WHEN size(impacted_artifacts) = 0 THEN [NULL] ELSE impacted_artifacts END AS impacted_artifact
        OPTIONAL MATCH (impacted_artifact)<-[:OFF_REL]-(o:OffenseTech)
        RETURN
            size(impacted_artifacts) AS impacted_artifact_count,
            count(DISTINCT o) AS attack_count
        """
        rows = self.run_query(query, {"artifact_name": artifact_name})
        return rows[0] if rows else {"impacted_artifact_count": 0, "attack_count": 0}

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
