"""Artifact mapping service integrated from the uploaded live pipeline."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from app.db.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

IMPORTANT_KEYWORDS = {
    "token",
    "credential",
    "session",
    "file",
    "document",
    "pdf",
    "doc",
    "word",
    "spreadsheet",
    "excel",
    "attachment",
    "email",
    "malware",
    "malicious",
    "encrypted",
    "process",
    "network",
    "registry",
    "configuration",
    "certificate",
}

SYNONYM_MAP = {
    "jwt": "token",
    "oauth": "token",
    "api": "access",
    "cookie": "session",
    "attachment": "file",
    "invoice": "document",
    "email": "document",
    "pdf": "document",
    "doc": "document",
    "word": "document",
    "spreadsheet": "file",
    "excel": "file",
    "malicious": "file",
    "malware": "file",
    "encrypted": "document",
    "ransomware": "file",
    "locky": "file",
    "web": "session",
    "browser": "session",
    "cloud": "access",
}

EXPLICIT_ARTIFACT_MAPPINGS = {
    "kerberos ticket": "Access Token",
    "oauth token": "Access Token",
    "jwt token": "Access Token",
    "api key": "Credential",
    "session id": "Session",
    "browser cookie": "Session",
    "refresh token": "Access Token",
    "service account credential": "Credential",
    "ssh key": "Credential",
    "cloud credential": "Credential",
    "lsass memory": "Process",
    "process memory": "Process",
    "registry key": "Windows Registry",
    "startup folder entry": "Startup Item",
    "scheduled task entry": "Scheduled Task",
    "service binary": "Service",
    "dll file": "Dynamic Linker Library",
    "powershell script": "Script",
    "email attachment": "Document File",
    "dns cache": "DNS Lookup",
    "access log": "Log File",
    "authentication token": "Access Token",
    "browser session": "Session",
    "cloud api secret": "Credential",
    "process dump": "Process",
}

EXPLICIT_TARGET_ALIASES = {
    "Script": ["Create Process", "Process", "Process Segment", "Process Code Segment"],
}

KNOWN_FILE_EXTENSIONS = {"pdf", "doc", "docx", "exe", "dll", "zip", "rar"}
KNOWN_PROTOCOL_TOKENS = {"tcp", "udp", "http", "https", "dns", "ssh", "rdp", "smtp"}
RULE_BASED_MATCH_THRESHOLD = 1.5
DESCRIPTION_RULE_WEIGHT_MULTIPLIER = 0.85
SIMILARITY_ARTIFACT_WEIGHT = 0.7
SIMILARITY_DESCRIPTION_WEIGHT = 0.3


@dataclass
class MatchDiagnostics:
    """Explain which signals contributed to a match without changing API compatibility."""

    matched_keywords: list[str] = field(default_factory=list)
    matched_rule_count: int = 0
    artifact_score_contribution: float = 0.0
    description_score_contribution: float = 0.0
    artifact_keyword_hits: int = 0
    description_keyword_hits: int = 0


@dataclass
class GraphMatchResult:
    """Live artifact match result adapted from the uploaded package."""

    input_artifact: str
    matched_artifact: str
    matched_category: str
    score: float
    diagnostics: MatchDiagnostics = field(default_factory=MatchDiagnostics)


@dataclass
class MappingResult:
    """Outcome of artifact resolution."""

    matched_artifact: str | None
    matched_category: str | None
    mapping_method: str
    confidence_score: float
    candidate_pool_size: int
    top_matches: list[GraphMatchResult]
    mapping_rules_count: int = 0
    matched_keywords: list[str] = field(default_factory=list)
    matched_rule_count: int = 0
    dominant_source: str = "artifact_name"


@dataclass(frozen=True)
class CanonicalArtifact:
    """Canonical artifact entry resolved from the Neo4j catalog."""

    name: str
    category: str


class MappingService:
    """Resolve an input artifact using exact, explicit, rule-based, and similarity logic."""

    def __init__(self, neo4j_client: Neo4jClient) -> None:
        self.neo4j_client = neo4j_client
        self._last_normalized_description = ""

    def normalize_inputs(self, artifact_name: str, description: str | None) -> tuple[str, str]:
        """Normalize request inputs and retain description context for the current request.

        The current analysis flow calls `normalize_inputs()` before `select_best_artifact()`.
        We keep that public behavior intact and cache the normalized description so the later
        matching stages can use contextual evidence without forcing architecture changes.
        """
        normalized_artifact = self.normalize_artifact_text(artifact_name)
        normalized_description = self.normalize_artifact_text(description)
        self._last_normalized_description = normalized_description
        return normalized_artifact, normalized_description

    def fetch_context(self) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
        """Load artifact catalog and weighted mapping rules from Neo4j."""
        artifact_records = self.neo4j_client.fetch_artifacts()
        mapping_rules = self.neo4j_client.fetch_mapping_rules()
        logger.info(
            "Loaded mapping context with %s artifact candidates and %s mapping rules.",
            len(artifact_records),
            len(mapping_rules),
        )
        return artifact_records, mapping_rules

    def select_best_artifact(
        self,
        input_artifact: str,
        artifact_records: list[dict[str, str]],
        mapping_rules: list[dict[str, str]] | None = None,
        description: str | None = None,
    ) -> MappingResult:
        """Resolve the best artifact while remaining compatible with the current analysis flow."""
        mapping_rules = mapping_rules or []
        description_text = (
            self.normalize_artifact_text(description)
            if description is not None
            else self._last_normalized_description
        )
        logger.info(
            "Starting artifact resolution for artifact='%s' description='%s' with %s artifact candidates and %s rules.",
            input_artifact,
            description_text,
            len(artifact_records),
            len(mapping_rules),
        )
        top_matches = self.match_artifact_with_fallback(
            input_artifact=input_artifact,
            artifact_records=artifact_records,
            mapping_rules=mapping_rules,
            description=description_text,
            top_n=3,
        )
        best_match = top_matches[0] if top_matches else None
        mapping_method = self.resolve_best_match_method(
            new_artifact=input_artifact,
            best_match=best_match,
            artifact_records=artifact_records,
            mapping_rules=mapping_rules,
            description=description_text,
        )
        if best_match:
            logger.info(
                "Artifact resolution selected method='%s' matched_artifact='%s' score=%.4f.",
                mapping_method,
                best_match.matched_artifact,
                best_match.score,
            )
        else:
            logger.warning(
                "Artifact resolution produced no match for artifact='%s' description='%s'.",
                input_artifact,
                description_text,
            )

        return MappingResult(
            matched_artifact=best_match.matched_artifact if best_match else None,
            matched_category=best_match.matched_category if best_match else None,
            mapping_method=mapping_method,
            confidence_score=best_match.score if best_match else 0.0,
            candidate_pool_size=len(artifact_records),
            top_matches=top_matches,
            mapping_rules_count=len(mapping_rules),
            matched_keywords=best_match.diagnostics.matched_keywords if best_match else [],
            matched_rule_count=best_match.diagnostics.matched_rule_count if best_match else 0,
            dominant_source=self._determine_dominant_source(best_match.diagnostics) if best_match else "artifact_name",
        )

    def persist_best_match(
        self,
        input_artifact: str,
        selected_match: MappingResult,
    ) -> str:
        """Persist BEST_MATCH back to Neo4j when a reliable match exists."""
        if not self.neo4j_client.is_available():
            return "Neo4j unavailable; BEST_MATCH persistence skipped."

        self.neo4j_client.ensure_new_artifact_node(input_artifact)
        if selected_match.matched_artifact is None:
            return "No reliable BEST_MATCH was persisted."

        self.neo4j_client.create_or_update_best_match(
            artifact_name=input_artifact,
            matched_artifact=selected_match.matched_artifact,
            score=selected_match.confidence_score,
            method=selected_match.mapping_method,
        )
        return (
            f"Persisted BEST_MATCH relation using {selected_match.mapping_method} for "
            f"{selected_match.matched_artifact}."
        )

    @staticmethod
    def normalize_artifact_text(text: str | None) -> str:
        """Normalize free-text artifacts using the uploaded pipeline logic."""
        normalized = str(text or "").strip().lower()
        for char in ["/", "-", "_", ",", ".", "(", ")", "[", "]", ":", ";"]:
            normalized = normalized.replace(char, " ")
        return " ".join(normalized.split())

    def tokenize_text(self, text: str) -> set[str]:
        """Tokenize normalized text for overlap-based matching."""
        return set(self.normalize_artifact_text(text).split())

    def extract_numeric_tokens(self, text: str) -> set[str]:
        """Extract numeric tokens from free-text artifact input."""
        normalized = self.normalize_artifact_text(text)
        return set(re.findall(r"\b\d+\b", normalized))

    def detect_likely_port_numbers(self, text: str) -> set[str]:
        """Detect valid port numbers from free-text input."""
        ports: set[str] = set()
        for token in self.extract_numeric_tokens(text):
            try:
                value = int(token)
            except ValueError:
                continue
            if 0 <= value <= 65535:
                ports.add(str(value))
        return ports

    def detect_file_extensions(self, text: str) -> set[str]:
        """Detect file extension tokens."""
        return self.tokenize_text(text) & KNOWN_FILE_EXTENSIONS

    def detect_protocol_tokens(self, text: str) -> set[str]:
        """Detect protocol tokens such as DNS or SSH."""
        return self.tokenize_text(text) & KNOWN_PROTOCOL_TOKENS

    def expand_synonyms(self, tokens: set[str]) -> set[str]:
        """Expand tokens using the manual synonym map from the integration package."""
        expanded_tokens = set(tokens)
        for token in list(tokens):
            if token in SYNONYM_MAP:
                expanded_tokens.add(SYNONYM_MAP[token])
        return expanded_tokens

    @staticmethod
    def _jaccard_similarity(left_tokens: set[str], right_tokens: set[str]) -> float:
        if not left_tokens or not right_tokens:
            return 0.0
        return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)

    @staticmethod
    def _contains_phrase(left_text: str, right_text: str) -> bool:
        return bool(left_text and right_text and (left_text in right_text or right_text in left_text))

    @staticmethod
    def _determine_dominant_source(diagnostics: MatchDiagnostics) -> str:
        """Identify whether artifact name or description contributed more evidence."""
        if diagnostics.description_score_contribution > diagnostics.artifact_score_contribution:
            return "description"
        if diagnostics.description_score_contribution == diagnostics.artifact_score_contribution:
            return "balanced"
        return "artifact_name"

    def _build_combined_query_text(self, artifact_name: str, description: str) -> str:
        """Combine artifact and description for similarity fallback.

        Description matters here because users often type a generic artifact name while the real
        differentiating signal lives in the surrounding context, such as protocol, file type, or
        credential wording.
        """
        return " ".join(part for part in [artifact_name, description] if part).strip()

    def _build_match_diagnostics(
        self,
        artifact_keywords: set[str] | None = None,
        description_keywords: set[str] | None = None,
        artifact_score_contribution: float = 0.0,
        description_score_contribution: float = 0.0,
    ) -> MatchDiagnostics:
        artifact_keywords = artifact_keywords or set()
        description_keywords = description_keywords or set()
        return MatchDiagnostics(
            matched_keywords=sorted(artifact_keywords | description_keywords),
            matched_rule_count=len(artifact_keywords | description_keywords),
            artifact_score_contribution=round(artifact_score_contribution, 4),
            description_score_contribution=round(description_score_contribution, 4),
            artifact_keyword_hits=len(artifact_keywords),
            description_keyword_hits=len(description_keywords),
        )

    def compute_artifact_match_score(
        self,
        query: str,
        candidate: str,
        description: str = "",
    ) -> tuple[float, MatchDiagnostics]:
        """Similarity scorer using artifact text plus optional description context.

        Tie-breaking uses the artifact name as the primary signal and the description as a
        secondary signal. This preserves the existing hierarchy while letting context help
        separate otherwise ambiguous artifact names.
        """
        query_norm = self.normalize_artifact_text(query)
        description_norm = self.normalize_artifact_text(description)
        candidate_norm = self.normalize_artifact_text(candidate)

        if not query_norm or not candidate_norm:
            return 0.0, MatchDiagnostics()
        if query_norm == candidate_norm:
            return 1.0, self._build_match_diagnostics(
                artifact_keywords=self.tokenize_text(query_norm) & self.tokenize_text(candidate_norm),
                artifact_score_contribution=1.0,
            )

        query_tokens = self.tokenize_text(query_norm)
        description_tokens = self.tokenize_text(description_norm)
        candidate_tokens = self.tokenize_text(candidate_norm)

        query_expanded = self.expand_synonyms(query_tokens)
        description_expanded = self.expand_synonyms(description_tokens)
        candidate_expanded = self.expand_synonyms(candidate_tokens)

        artifact_sequence_score = SequenceMatcher(None, query_norm, candidate_norm).ratio()
        artifact_token_overlap = self._jaccard_similarity(query_tokens, candidate_tokens)
        artifact_synonym_overlap = self._jaccard_similarity(query_expanded, candidate_expanded)
        artifact_token_coverage = (
            len(query_expanded & candidate_expanded) / len(candidate_tokens) if candidate_tokens else 0.0
        )
        artifact_keyword_overlap = IMPORTANT_KEYWORDS & query_expanded & candidate_expanded
        artifact_keyword_bonus = min(0.04 * len(artifact_keyword_overlap), 0.12)
        artifact_substring_bonus = 0.12 if self._contains_phrase(query_norm, candidate_norm) else 0.0

        description_sequence_score = SequenceMatcher(None, description_norm, candidate_norm).ratio() if description_norm else 0.0
        description_token_overlap = self._jaccard_similarity(description_tokens, candidate_tokens)
        description_synonym_overlap = self._jaccard_similarity(description_expanded, candidate_expanded)
        description_token_coverage = (
            len(description_expanded & candidate_expanded) / len(candidate_tokens) if candidate_tokens else 0.0
        )
        description_keyword_overlap = IMPORTANT_KEYWORDS & description_expanded & candidate_expanded
        description_keyword_bonus = min(0.04 * len(description_keyword_overlap), 0.12)
        description_substring_bonus = (
            0.08 if description_norm and self._contains_phrase(description_norm, candidate_norm) else 0.0
        )

        artifact_component = (
            0.25 * artifact_token_overlap
            + 0.27 * artifact_synonym_overlap
            + 0.22 * artifact_token_coverage
            + 0.14 * artifact_sequence_score
            + artifact_substring_bonus
            + artifact_keyword_bonus
        )
        description_component = (
            0.22 * description_token_overlap
            + 0.24 * description_synonym_overlap
            + 0.18 * description_token_coverage
            + 0.10 * description_sequence_score
            + description_substring_bonus
            + description_keyword_bonus
        )
        score = min(
            (SIMILARITY_ARTIFACT_WEIGHT * artifact_component)
            + (SIMILARITY_DESCRIPTION_WEIGHT * description_component),
            0.99,
        )
        diagnostics = self._build_match_diagnostics(
            artifact_keywords=artifact_keyword_overlap,
            description_keywords=description_keyword_overlap,
            artifact_score_contribution=SIMILARITY_ARTIFACT_WEIGHT * artifact_component,
            description_score_contribution=SIMILARITY_DESCRIPTION_WEIGHT * description_component,
        )
        return score, diagnostics

    @staticmethod
    def _build_artifact_category_map(artifact_records: list[dict[str, str]]) -> dict[str, str]:
        return {
            str(record.get("artifact", "")).strip(): str(record.get("category", "Unknown")).strip() or "Unknown"
            for record in artifact_records
            if str(record.get("artifact", "")).strip()
        }

    def _build_canonical_artifact_lookup(
        self,
        artifact_records: list[dict[str, str]],
    ) -> dict[str, CanonicalArtifact]:
        """Build normalized lookup keys for canonical artifact names."""
        canonical_lookup: dict[str, CanonicalArtifact] = {}
        for record in artifact_records:
            artifact_name = str(record.get("artifact", "")).strip()
            if not artifact_name:
                continue
            category = str(record.get("category", "Unknown")).strip() or "Unknown"
            canonical = CanonicalArtifact(name=artifact_name, category=category)
            canonical_lookup.setdefault(artifact_name, canonical)
            canonical_lookup.setdefault(self.normalize_artifact_text(artifact_name), canonical)
        return canonical_lookup

    def _resolve_canonical_artifact(
        self,
        target_artifact: str,
        artifact_records: list[dict[str, str]],
        source_text: str = "",
    ) -> CanonicalArtifact | None:
        """Resolve a target artifact against the live catalog using normalized matching."""
        canonical_lookup = self._build_canonical_artifact_lookup(artifact_records)
        if target_artifact in canonical_lookup:
            return canonical_lookup[target_artifact]

        normalized_target = self.normalize_artifact_text(target_artifact)
        if normalized_target in canonical_lookup:
            return canonical_lookup[normalized_target]

        alias_candidates = EXPLICIT_TARGET_ALIASES.get(target_artifact, [])
        for alias in alias_candidates:
            normalized_alias = self.normalize_artifact_text(alias)
            if alias in canonical_lookup:
                logger.info(
                    "Resolved explicit target '%s' via alias '%s'.",
                    target_artifact,
                    alias,
                )
                return canonical_lookup[alias]
            if normalized_alias in canonical_lookup:
                logger.info(
                    "Resolved explicit target '%s' via normalized alias '%s'.",
                    target_artifact,
                    alias,
                )
                return canonical_lookup[normalized_alias]

        target_tokens = self.tokenize_text(normalized_target)
        source_tokens = self.tokenize_text(source_text)
        best_candidate: CanonicalArtifact | None = None
        best_score = 0.0

        for canonical in canonical_lookup.values():
            candidate_tokens = self.tokenize_text(canonical.name)
            token_overlap = self._jaccard_similarity(target_tokens, candidate_tokens)
            source_overlap = self._jaccard_similarity(source_tokens, candidate_tokens) if source_tokens else 0.0
            sequence_score = SequenceMatcher(None, normalized_target, self.normalize_artifact_text(canonical.name)).ratio()
            score = (0.55 * token_overlap) + (0.25 * source_overlap) + (0.20 * sequence_score)
            if score > best_score:
                best_score = score
                best_candidate = canonical

        if best_candidate and best_score >= 0.55:
            logger.info(
                "Resolved explicit target '%s' to canonical artifact '%s' using fuzzy catalog lookup (score=%.4f).",
                target_artifact,
                best_candidate.name,
                best_score,
            )
            return best_candidate

        logger.warning(
            "Rejected explicit target '%s' because no canonical artifact matched in a catalog of %s entries.",
            target_artifact,
            len(artifact_records),
        )
        return None

    def find_exact_artifact_match(
        self,
        new_artifact: str,
        artifact_records: list[dict[str, str]],
    ) -> GraphMatchResult | None:
        """Return an exact artifact match before any fuzzy logic."""
        query_norm = self.normalize_artifact_text(new_artifact)
        if not query_norm:
            logger.debug("Exact match skipped because normalized artifact query is empty.")
            return None

        for record in artifact_records:
            artifact_name = str(record.get("artifact", "")).strip()
            category = str(record.get("category", "Unknown")).strip() or "Unknown"
            if query_norm == self.normalize_artifact_text(artifact_name):
                logger.info("Exact mapping matched '%s' to canonical artifact '%s'.", new_artifact, artifact_name)
                return GraphMatchResult(
                    new_artifact,
                    artifact_name,
                    category,
                    1.0,
                    diagnostics=self._build_match_diagnostics(
                        artifact_keywords=self.tokenize_text(query_norm) & self.tokenize_text(artifact_name),
                        artifact_score_contribution=1.0,
                    ),
                )
        logger.info("Exact mapping found no match for '%s'.", new_artifact)
        return None

    def find_explicit_mapping_match(
        self,
        new_artifact: str,
        artifact_records: list[dict[str, str]],
        description: str = "",
    ) -> GraphMatchResult | None:
        """Return a high-confidence explicit mapping from artifact and context text."""
        normalized_input = self.normalize_artifact_text(new_artifact)
        normalized_description = self.normalize_artifact_text(description)
        combined_text = self._build_combined_query_text(normalized_input, normalized_description)

        target_artifact = None
        matched_keywords: set[str] = set()

        if "jwt" in combined_text:
            target_artifact = "Access Token"
            matched_keywords.add("jwt")
        elif normalized_input in EXPLICIT_ARTIFACT_MAPPINGS:
            target_artifact = EXPLICIT_ARTIFACT_MAPPINGS[normalized_input]
            matched_keywords.add(normalized_input)
        else:
            for phrase, mapped_artifact in EXPLICIT_ARTIFACT_MAPPINGS.items():
                if phrase in combined_text:
                    target_artifact = mapped_artifact
                    matched_keywords.add(phrase)
                    break

        if not target_artifact:
            logger.info(
                "Explicit mapping found no target for artifact='%s' description='%s'.",
                new_artifact,
                description,
            )
            return None

        canonical_artifact = self._resolve_canonical_artifact(
            target_artifact=target_artifact,
            artifact_records=artifact_records,
            source_text=combined_text,
        )
        if canonical_artifact is None:
            logger.warning(
                "Explicit mapping rejected target '%s' for artifact='%s' because no canonical catalog match was found.",
                target_artifact,
                new_artifact,
            )
            return None

        artifact_hits = {keyword for keyword in matched_keywords if keyword in normalized_input}
        description_hits = matched_keywords - artifact_hits
        logger.info(
            "Explicit mapping matched artifact='%s' description='%s' to canonical artifact '%s'.",
            new_artifact,
            description,
            canonical_artifact.name,
        )
        return GraphMatchResult(
            input_artifact=new_artifact,
            matched_artifact=canonical_artifact.name,
            matched_category=canonical_artifact.category,
            score=0.98,
            diagnostics=self._build_match_diagnostics(
                artifact_keywords=artifact_hits,
                description_keywords=description_hits,
                artifact_score_contribution=0.98 if artifact_hits else 0.0,
                description_score_contribution=0.98 if description_hits else 0.0,
            ),
        )

    def _collect_rule_match_sets(self, artifact_text: str, description_text: str = "") -> dict[str, dict[str, set[str]]]:
        """Collect artifact and description token groups separately.

        Weighted matching now considers both sources. Artifact name remains stronger, but
        description-derived tokens can still lift a candidate when they reveal protocol,
        credential, or document context that the name alone does not contain.
        """
        artifact_tokens = self.tokenize_text(artifact_text)
        description_tokens = self.tokenize_text(description_text)
        artifact_numeric = self.extract_numeric_tokens(artifact_text)
        description_numeric = self.extract_numeric_tokens(description_text)
        artifact_ports = self.detect_likely_port_numbers(artifact_text)
        description_ports = self.detect_likely_port_numbers(description_text)
        artifact_extensions = self.detect_file_extensions(artifact_text)
        description_extensions = self.detect_file_extensions(description_text)
        artifact_protocols = self.detect_protocol_tokens(artifact_text)
        description_protocols = self.detect_protocol_tokens(description_text)

        return {
            "artifact_name": {
                "token": artifact_tokens,
                "keyword": artifact_tokens,
                "exact": artifact_tokens,
                "numeric": artifact_numeric,
                "number": artifact_numeric,
                "port": artifact_ports,
                "extension": artifact_extensions,
                "ext": artifact_extensions,
                "protocol": artifact_protocols,
                "service": artifact_protocols,
            },
            "description": {
                "token": description_tokens,
                "keyword": description_tokens,
                "exact": description_tokens,
                "numeric": description_numeric,
                "number": description_numeric,
                "port": description_ports,
                "extension": description_extensions,
                "ext": description_extensions,
                "protocol": description_protocols,
                "service": description_protocols,
            },
        }

    def _normalize_mapping_rule(self, rule: dict[str, str]) -> dict[str, str | float]:
        keyword = self.normalize_artifact_text(rule.get("keyword", ""))
        target_artifact = str(rule.get("target_artifact", "")).strip()
        rule_type = self.normalize_artifact_text(rule.get("rule_type", "")) or "token"
        source = str(rule.get("source", "Unknown")).strip() or "Unknown"
        try:
            weight = float(rule.get("weight", 0.0) or 0.0)
        except (TypeError, ValueError):
            weight = 0.0
        return {
            "keyword": keyword,
            "target_artifact": target_artifact,
            "rule_type": rule_type,
            "weight": weight,
            "source": source,
        }

    def _resolve_rule_candidate_values(
        self,
        rule_type: str,
        matched_values: dict[str, set[str]],
    ) -> set[str]:
        normalized_type = self.normalize_artifact_text(rule_type)
        if normalized_type in {"port", "port rule"} or "port" in normalized_type:
            return matched_values["port"]
        if normalized_type in {"extension", "ext"} or "extension" in normalized_type:
            return matched_values["extension"]
        if normalized_type in {"protocol", "service"} or "protocol" in normalized_type:
            return matched_values["protocol"]
        if normalized_type in {"numeric", "number"} or "number" in normalized_type:
            return matched_values["numeric"]
        return matched_values.get(normalized_type, matched_values["token"])

    def find_best_matches_with_rules(
        self,
        new_artifact: str,
        artifact_records: list[dict[str, str]],
        mapping_rules: list[dict[str, str]],
        description: str = "",
        top_n: int = 3,
    ) -> list[GraphMatchResult]:
        """Score graph artifacts using MappingRule weights and description-aware evidence.

        Weighted matching works by summing the rule weights of every keyword that points to the
        same target artifact. Artifact-name matches keep full weight, while description matches
        get a slightly smaller multiplier so context helps without overpowering the actual input.

        Tie-breaking order:
        1. total weighted score
        2. artifact-name contribution
        3. matched keyword count
        4. alphabetical artifact name for deterministic output
        """
        if not mapping_rules:
            logger.info("Rule-based mapping skipped because no mapping rules were available.")
            return []

        artifact_categories = self._build_artifact_category_map(artifact_records)
        matched_values_by_source = self._collect_rule_match_sets(new_artifact, description)
        target_scores: dict[str, dict[str, object]] = {}

        for raw_rule in mapping_rules:
            rule = self._normalize_mapping_rule(raw_rule)
            target_artifact = str(rule["target_artifact"])
            keyword = str(rule["keyword"])
            if not target_artifact or not keyword:
                continue

            artifact_values = self._resolve_rule_candidate_values(
                str(rule["rule_type"]),
                matched_values_by_source["artifact_name"],
            )
            description_values = self._resolve_rule_candidate_values(
                str(rule["rule_type"]),
                matched_values_by_source["description"],
            )

            artifact_hit = keyword in artifact_values
            description_hit = keyword in description_values
            if not artifact_hit and not description_hit:
                continue

            bucket = target_scores.setdefault(
                target_artifact,
                {
                    "total_score": 0.0,
                    "artifact_score": 0.0,
                    "description_score": 0.0,
                    "artifact_keywords": set(),
                    "description_keywords": set(),
                },
            )
            weight = float(rule["weight"])
            if artifact_hit:
                bucket["total_score"] = float(bucket["total_score"]) + weight
                bucket["artifact_score"] = float(bucket["artifact_score"]) + weight
                cast_keywords = bucket["artifact_keywords"]
                assert isinstance(cast_keywords, set)
                cast_keywords.add(keyword)
            if description_hit:
                description_weight = weight * DESCRIPTION_RULE_WEIGHT_MULTIPLIER
                bucket["total_score"] = float(bucket["total_score"]) + description_weight
                bucket["description_score"] = float(bucket["description_score"]) + description_weight
                cast_keywords = bucket["description_keywords"]
                assert isinstance(cast_keywords, set)
                cast_keywords.add(keyword)

        scored_matches: list[GraphMatchResult] = []
        for target_artifact, score_data in target_scores.items():
            artifact_keywords = set(score_data["artifact_keywords"])
            description_keywords = set(score_data["description_keywords"])
            diagnostics = self._build_match_diagnostics(
                artifact_keywords=artifact_keywords,
                description_keywords=description_keywords,
                artifact_score_contribution=float(score_data["artifact_score"]),
                description_score_contribution=float(score_data["description_score"]),
            )
            diagnostics.matched_rule_count = len(artifact_keywords | description_keywords)
            scored_matches.append(
                GraphMatchResult(
                    input_artifact=new_artifact,
                    matched_artifact=target_artifact,
                    matched_category=artifact_categories.get(target_artifact, "Unknown"),
                    score=float(score_data["total_score"]),
                    diagnostics=diagnostics,
                )
            )

        scored_matches.sort(
            key=lambda item: (
                item.score,
                item.diagnostics.artifact_score_contribution,
                item.diagnostics.matched_rule_count,
                item.matched_artifact,
            ),
            reverse=True,
        )
        if scored_matches:
            logger.info(
                "Rule-based mapping top candidates for '%s': %s",
                new_artifact,
                ", ".join(f"{item.matched_artifact}={item.score:.4f}" for item in scored_matches[:3]),
            )
        else:
            logger.info("Rule-based mapping found no candidates for '%s'.", new_artifact)
        return scored_matches[:top_n]

    @staticmethod
    def is_strong_rule_based_match(
        match_result: GraphMatchResult | None,
        threshold: float = RULE_BASED_MATCH_THRESHOLD,
    ) -> bool:
        return match_result is not None and match_result.score >= threshold

    def rank_artifact_matches(
        self,
        query: str,
        artifact_records: list[dict[str, str]],
        description: str = "",
        top_n: int = 3,
    ) -> list[GraphMatchResult]:
        """Similarity-based fallback that now uses description-aware context."""
        scored_matches: list[GraphMatchResult] = []
        for record in artifact_records:
            artifact_name = str(record.get("artifact", "")).strip()
            category = str(record.get("category", "Unknown")).strip() or "Unknown"
            score, diagnostics = self.compute_artifact_match_score(query, artifact_name, description=description)
            scored_matches.append(
                GraphMatchResult(
                    input_artifact=query,
                    matched_artifact=artifact_name,
                    matched_category=category,
                    score=score,
                    diagnostics=diagnostics,
                )
            )

        scored_matches.sort(
            key=lambda item: (
                item.score,
                item.diagnostics.artifact_score_contribution,
                item.diagnostics.description_score_contribution,
                item.matched_artifact,
            ),
            reverse=True,
        )
        logger.info(
            "Similarity mapping top candidates for '%s': %s",
            query,
            ", ".join(f"{item.matched_artifact}={item.score:.4f}" for item in scored_matches[:3]),
        )
        return scored_matches[:top_n]

    def match_artifact_with_fallback(
        self,
        input_artifact: str,
        artifact_records: list[dict[str, str]],
        mapping_rules: list[dict[str, str]] | None = None,
        description: str = "",
        top_n: int = 3,
    ) -> list[GraphMatchResult]:
        """Original fallback order: exact -> explicit -> weighted rule-based -> similarity."""
        exact_match = self.find_exact_artifact_match(input_artifact, artifact_records)
        if exact_match is not None:
            logger.info("Mapping pipeline selected exact matching for '%s'.", input_artifact)
            return [exact_match]

        explicit_match = self.find_explicit_mapping_match(input_artifact, artifact_records, description=description)
        if explicit_match is not None:
            logger.info("Mapping pipeline selected explicit mapping for '%s'.", input_artifact)
            return [explicit_match]

        rule_matches = self.find_best_matches_with_rules(
            input_artifact,
            artifact_records,
            mapping_rules or [],
            description=description,
            top_n=top_n,
        )
        best_rule_match = rule_matches[0] if rule_matches else None
        if self.is_strong_rule_based_match(best_rule_match):
            logger.info("Mapping pipeline selected rule-based matching for '%s'.", input_artifact)
            return rule_matches

        logger.info("Mapping pipeline fell back to similarity matching for '%s'.", input_artifact)
        return self.rank_artifact_matches(input_artifact, artifact_records, description=description, top_n=top_n)

    def resolve_best_match_method(
        self,
        new_artifact: str,
        best_match: GraphMatchResult | None,
        artifact_records: list[dict[str, str]],
        mapping_rules: list[dict[str, str]] | None = None,
        description: str = "",
    ) -> str:
        """Identify which strategy produced the selected artifact."""
        if best_match is None:
            return "none"

        exact_match = self.find_exact_artifact_match(new_artifact, artifact_records)
        if exact_match and exact_match.matched_artifact == best_match.matched_artifact:
            return "exact"

        explicit_match = self.find_explicit_mapping_match(new_artifact, artifact_records, description=description)
        if explicit_match and explicit_match.matched_artifact == best_match.matched_artifact:
            return "explicit_mapping"

        rule_matches = self.find_best_matches_with_rules(
            new_artifact,
            artifact_records,
            mapping_rules or [],
            description=description,
            top_n=1,
        )
        if rule_matches and rule_matches[0].matched_artifact == best_match.matched_artifact:
            return "rule_based"

        return "similarity"
