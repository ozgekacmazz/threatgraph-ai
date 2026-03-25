"""
Requirements:
- neo4j
- pandas
- scikit-learn
- pickle

This module keeps the hybrid pipeline readable:
Knowledge Graph generates candidate attacks/defenses,
Machine Learning scores only the candidate attacks.
"""

import pickle
import os
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd
from neo4j import GraphDatabase


FEATURE_COLUMNS = [
    "artifact_enc",
    "attack_enc",
    "category_enc",
    "tactic_enc",
    "attack_count",
    "defense_count",
    "impact_count",
    "similar_count",
    "risk_score",
    "centrality_score",
    "attack_global_frequency",
    "same_category_frequency",
    "rule_score_total",
    "matched_rule_count",
    "max_rule_weight",
    "unique_rule_types_count",
    "identity_rule_score",
    "file_rule_score",
    "protocol_rule_score",
    "port_rule_score",
    "system_rule_score",
    "context_rule_score",
    "network_rule_score",
    "has_port_signal",
    "has_protocol_signal",
    "has_file_signal",
    "has_identity_signal",
    "has_system_signal",
    "has_context_signal",
    "has_network_signal",
]

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

KNOWN_FILE_EXTENSIONS = {"pdf", "doc", "docx", "exe", "dll", "zip", "rar"}
KNOWN_PROTOCOL_TOKENS = {
    "tcp",
    "udp",
    "http",
    "https",
    "dns",
    "ssh",
    "rdp",
    "smtp",
}
RULE_BASED_MATCH_THRESHOLD = 1.5
RULE_SCORE_FIELDS = [
    "rule_score_total",
    "matched_rule_count",
    "max_rule_weight",
    "unique_rule_types_count",
    "identity_rule_score",
    "file_rule_score",
    "protocol_rule_score",
    "port_rule_score",
    "system_rule_score",
    "context_rule_score",
    "network_rule_score",
]
RULE_FLAG_FIELDS = [
    "has_port_signal",
    "has_protocol_signal",
    "has_file_signal",
    "has_identity_signal",
    "has_system_signal",
    "has_context_signal",
    "has_network_signal",
]
DEFAULT_RULE_SIGNAL_FEATURES = {
    **{field: 0.0 for field in RULE_SCORE_FIELDS},
    **{field: 0 for field in RULE_FLAG_FIELDS},
}
RULE_TYPE_TO_FEATURE = {
    "identity": "identity_rule_score",
    "auth": "identity_rule_score",
    "credential": "identity_rule_score",
    "session": "identity_rule_score",
    "token": "identity_rule_score",
    "file": "file_rule_score",
    "document": "file_rule_score",
    "extension": "file_rule_score",
    "ext": "file_rule_score",
    "protocol": "protocol_rule_score",
    "service": "protocol_rule_score",
    "port": "port_rule_score",
    "system": "system_rule_score",
    "host": "system_rule_score",
    "process": "system_rule_score",
    "registry": "system_rule_score",
    "context": "context_rule_score",
    "behavior": "context_rule_score",
    "network": "network_rule_score",
    "dns": "network_rule_score",
    "http": "network_rule_score",
    "traffic": "network_rule_score",
}


@dataclass
class GraphMatchResult:
    input_artifact: str
    matched_artifact: str
    matched_category: str
    score: float


def load_runtime_settings():
    """Load Neo4j runtime settings from environment variables with optional .env support."""
    base_dir = Path(__file__).resolve().parents[1]
    env_path = base_dir / ".env"

    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)

    return {
        "uri": os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687"),
        "username": os.getenv("NEO4J_USERNAME", "neo4j"),
        "password": os.getenv("NEO4J_PASSWORD", "12345678"),
        "database": os.getenv("NEO4J_DATABASE", "d3fend-kg"),
    }


def get_project_paths():
    """Resolve project paths and create the results folder if needed."""
    base_dir = Path(__file__).resolve().parents[1]
    data_dir = base_dir / "data"
    results_dir = base_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    return base_dir, data_dir, results_dir


def load_pickle(file_path):
    """Load a pickle file with a clear error if it does not exist."""
    if not file_path.exists():
        raise FileNotFoundError(f"Required file not found: {file_path}")

    with open(file_path, "rb") as file:
        return pickle.load(file)


def load_csv_data(data_dir):
    """Load CSV files needed for live hybrid prediction."""
    paths = {
        "artifact_features": data_dir / "artifact_features.csv",
        "artifact_attack_pairs": data_dir / "artifact_attack_pairs.csv",
        "attack_tactics": data_dir / "attack_tactics.csv",
        "attack_candidate_dataset": data_dir / "attack_candidate_dataset.csv",
    }

    for path in paths.values():
        if not path.exists():
            raise FileNotFoundError(f"Required CSV file not found: {path}")

    return {
        "artifact_features": pd.read_csv(paths["artifact_features"]),
        "artifact_attack_pairs": pd.read_csv(paths["artifact_attack_pairs"]),
        "attack_tactics": pd.read_csv(paths["attack_tactics"]),
        "attack_candidate_dataset": pd.read_csv(paths["attack_candidate_dataset"]),
    }


class Neo4jConnection:
    """Lightweight Neo4j helper for fetching artifacts, attacks, and defenses."""

    def __init__(self, uri, user, password, database=None):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        self.database = database

    def close(self):
        if self.driver:
            self.driver.close()

    def fetch_artifacts(self):
        query = """
        MATCH (a:Artifact)
        RETURN DISTINCT
            a.name AS artifact,
            coalesce(a.category, "Unknown") AS category
        ORDER BY artifact
        """
        return self._run_query(query)

    def ensure_new_artifact_node(self, artifact_name):
        """Create the NewArtifact node if it does not already exist."""
        query = """
        MERGE (n:NewArtifact {name: $artifact_name})
        ON CREATE SET n.created_at = datetime()
        SET n.last_seen_at = datetime()
        RETURN n.name AS artifact
        """
        records = self._run_query(query, {"artifact_name": artifact_name})
        return records[0] if records else {"artifact": artifact_name}

    def fetch_new_artifact_best_match(self, artifact_name):
        """Return an existing BEST_MATCH relation for a NewArtifact if present."""
        query = """
        MATCH (n:NewArtifact {name: $artifact_name})-[r:BEST_MATCH]->(a:Artifact)
        RETURN
            a.name AS artifact,
            coalesce(a.category, "Unknown") AS category,
            properties(r) AS relation_properties
        ORDER BY a.name ASC
        LIMIT 1
        """
        records = self._run_query(query, {"artifact_name": artifact_name})
        return records[0] if records else None

    def create_or_update_best_match(self, artifact_name, matched_artifact, score, method):
        """Persist the BEST_MATCH relation from NewArtifact to Artifact."""
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
        records = self._run_query(
            query,
            {
                "artifact_name": artifact_name,
                "matched_artifact": matched_artifact,
                "score": float(score),
                "method": method,
            },
        )
        return records[0] if records else None

    def fetch_attacks_for_artifact(self, artifact_name):
        query = """
        MATCH (o:OffenseTech)-[:OFF_REL]->(a:Artifact {name: $artifact_name})
        RETURN DISTINCT
            o.name AS attack
        ORDER BY attack
        """
        return self._run_query(query, {"artifact_name": artifact_name})

    def fetch_direct_tactics_for_artifact(self, artifact_name):
        """Return direct tactics inferred from attacks linked to the artifact."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})<-[:OFF_REL]-(o:OffenseTech)
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
        RETURN DISTINCT
            t.name AS tactic
        ORDER BY tactic
        """
        return self._run_query(query, {"artifact_name": artifact_name})

    def fetch_next_tactics_for_artifact(self, artifact_name):
        """Return next tactics reachable from the artifact's direct tactics."""
        query = """
        MATCH (a:Artifact {name: $artifact_name})<-[:OFF_REL]-(o:OffenseTech)
        MATCH (t:Tactic)-[:HAS_TECHNIQUE]->(o)
        MATCH (t)-[:NEXT_TACTIC]->(nt:Tactic)
        RETURN DISTINCT
            nt.name AS tactic
        ORDER BY tactic
        """
        return self._run_query(query, {"artifact_name": artifact_name})

    def fetch_defenses_for_artifact(self, artifact_name):
        query = """
        MATCH (d:DefenseTech)-[:DEF_REL]->(a:Artifact {name: $artifact_name})
        RETURN DISTINCT
            d.name AS defense
        ORDER BY defense
        """
        return self._run_query(query, {"artifact_name": artifact_name})

    def fetch_all_artifact_defense_pairs(self):
        query = """
        MATCH (d:DefenseTech)-[:DEF_REL]->(a:Artifact)
        RETURN DISTINCT
            a.name AS artifact,
            coalesce(a.category, "Unknown") AS category,
            d.name AS defense
        ORDER BY artifact, defense
        """
        return self._run_query(query)

    def fetch_mapping_rules(self):
        """Fetch all MappingRule nodes with safe defaults for live artifact matching."""
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
        return self._run_query(query)

    def _run_query(self, query, parameters=None):
        with self.driver.session(database=self.database) as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]


def normalize_artifact_text(text):
    """Normalize artifact text with simple punctuation cleanup."""
    normalized = str(text).strip().lower()
    for char in ["/", "-", "_", ",", ".", "(", ")", "[", "]", ":", ";"]:
        normalized = normalized.replace(char, " ")
    return " ".join(normalized.split())


def tokenize_text(text):
    """Tokenize normalized text for overlap-based matching."""
    return set(normalize_artifact_text(text).split())


def extract_text_tokens(text):
    """Return normalized plain-text tokens for rule-based matching."""
    return tokenize_text(text)


def extract_numeric_tokens(text):
    """Extract numeric tokens from free-text artifact input."""
    normalized = normalize_artifact_text(text)
    return set(re.findall(r"\b\d+\b", normalized))


def detect_likely_port_numbers(text):
    """Detect valid TCP/UDP-style port numbers from free-text input."""
    ports = set()
    for token in extract_numeric_tokens(text):
        try:
            value = int(token)
        except ValueError:
            continue
        if 0 <= value <= 65535:
            ports.add(str(value))
    return ports


def detect_file_extensions(text):
    """Detect well-known file extension tokens such as pdf or docx."""
    return extract_text_tokens(text) & KNOWN_FILE_EXTENSIONS


def detect_protocol_tokens(text):
    """Detect protocol-like tokens such as dns, ssh, http, or smtp."""
    return extract_text_tokens(text) & KNOWN_PROTOCOL_TOKENS


def expand_synonyms(tokens):
    """Expand tokens with a small manual synonym dictionary."""
    expanded_tokens = set(tokens)
    for token in list(tokens):
        if token in SYNONYM_MAP:
            expanded_tokens.add(SYNONYM_MAP[token])
    return expanded_tokens


def _jaccard_similarity(left_tokens, right_tokens):
    """Compute Jaccard overlap safely."""
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _contains_phrase(left_text, right_text):
    """Check simple substring containment."""
    return bool(left_text and right_text and (left_text in right_text or right_text in left_text))


def compute_artifact_match_score(query, candidate):
    """Combine exact, normalized, token, substring, synonym, keyword, and sequence signals."""
    query_norm = normalize_artifact_text(query)
    candidate_norm = normalize_artifact_text(candidate)

    if not query_norm or not candidate_norm:
        return 0.0

    if query_norm == candidate_norm:
        return 1.0

    query_tokens = tokenize_text(query_norm)
    candidate_tokens = tokenize_text(candidate_norm)
    query_expanded = expand_synonyms(query_tokens)
    candidate_expanded = expand_synonyms(candidate_tokens)

    exact_bonus = 0.0
    normalized_bonus = 0.0
    substring_bonus = 0.12 if _contains_phrase(query_norm, candidate_norm) else 0.0
    sequence_score = SequenceMatcher(None, query_norm, candidate_norm).ratio()
    token_overlap = _jaccard_similarity(query_tokens, candidate_tokens)
    synonym_overlap = _jaccard_similarity(query_expanded, candidate_expanded)
    candidate_token_coverage = (
        len(query_expanded & candidate_expanded) / len(candidate_tokens)
        if candidate_tokens
        else 0.0
    )

    if str(query).strip().lower() == str(candidate).strip().lower():
        exact_bonus = 0.25
    if query_norm == candidate_norm:
        normalized_bonus = 0.20

    keyword_overlap = IMPORTANT_KEYWORDS & query_expanded & candidate_expanded
    keyword_bonus = min(0.04 * len(keyword_overlap), 0.12)
    concept_bonus = 0.10 if candidate_tokens and candidate_tokens.issubset(query_expanded) else 0.0
    document_file_terms = {"document", "file", "pdf", "doc", "word", "attachment", "email"}
    document_file_bonus = 0.0
    if (query_expanded & document_file_terms) and (candidate_expanded & {"document", "file"}):
        document_file_bonus = 0.12

    score = (
        0.18 * exact_bonus
        + 0.12 * normalized_bonus
        + 0.25 * token_overlap
        + 0.27 * synonym_overlap
        + 0.22 * candidate_token_coverage
        + 0.14 * sequence_score
        + substring_bonus
        + keyword_bonus
        + concept_bonus
        + document_file_bonus
    )
    return min(score, 0.99)


def _normalize_mapping_rule(rule):
    """Normalize a raw MappingRule record into a predictable dictionary."""
    keyword = normalize_artifact_text(rule.get("keyword", ""))
    target_artifact = str(rule.get("target_artifact", "")).strip()
    rule_type = normalize_artifact_text(rule.get("rule_type", "")) or "token"
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


def _build_artifact_category_map(artifact_records):
    """Create a quick lookup from artifact name to category."""
    return {
        str(record.get("artifact", "")).strip(): str(record.get("category", "Unknown")).strip()
        or "Unknown"
        for record in artifact_records
        if str(record.get("artifact", "")).strip()
    }


def find_exact_artifact_match(new_artifact, artifact_records):
    """Return an exact artifact match before any fuzzy logic is applied."""
    query_norm = normalize_artifact_text(new_artifact)
    if not query_norm:
        return None

    for record in artifact_records:
        artifact_name = str(record.get("artifact", "")).strip()
        category = str(record.get("category", "Unknown")).strip() or "Unknown"
        candidate_norm = normalize_artifact_text(artifact_name)

        if query_norm == candidate_norm:
            return GraphMatchResult(
                input_artifact=new_artifact,
                matched_artifact=artifact_name,
                matched_category=category,
                score=1.0,
            )

    return None


def find_explicit_mapping_match(new_artifact, artifact_records):
    """Return a high-confidence local mapping for important demo-safe artifacts."""
    normalized_input = normalize_artifact_text(new_artifact)
    if "jwt" in normalized_input:
        target_artifact = "Access Token"
    else:
        target_artifact = EXPLICIT_ARTIFACT_MAPPINGS.get(normalized_input)
    if not target_artifact:
        return None

    artifact_categories = _build_artifact_category_map(artifact_records)
    if target_artifact not in artifact_categories:
        return None

    return GraphMatchResult(
        input_artifact=new_artifact,
        matched_artifact=target_artifact,
        matched_category=artifact_categories[target_artifact],
        score=0.98,
    )


def _collect_rule_match_sets(new_artifact):
    """Collect token groups used by weighted rule-based matching."""
    tokens = extract_text_tokens(new_artifact)
    numeric_tokens = extract_numeric_tokens(new_artifact)
    port_tokens = detect_likely_port_numbers(new_artifact)
    extension_tokens = detect_file_extensions(new_artifact)
    protocol_tokens = detect_protocol_tokens(new_artifact)
    return {
        "token": tokens,
        "keyword": tokens,
        "exact": tokens,
        "numeric": numeric_tokens,
        "number": numeric_tokens,
        "port": port_tokens,
        "extension": extension_tokens,
        "ext": extension_tokens,
        "protocol": protocol_tokens,
        "service": protocol_tokens,
    }


def _canonical_rule_feature_name(rule_type):
    """Map a MappingRule type to one of the exported ML rule feature buckets."""
    normalized_type = normalize_artifact_text(rule_type)
    if normalized_type in RULE_TYPE_TO_FEATURE:
        return RULE_TYPE_TO_FEATURE[normalized_type]

    if "identity" in normalized_type or "credential" in normalized_type:
        return "identity_rule_score"
    if "file" in normalized_type or "document" in normalized_type:
        return "file_rule_score"
    if "protocol" in normalized_type or "service" in normalized_type:
        return "protocol_rule_score"
    if "port" in normalized_type:
        return "port_rule_score"
    if any(term in normalized_type for term in {"system", "host", "process", "registry"}):
        return "system_rule_score"
    if "context" in normalized_type or "behavior" in normalized_type:
        return "context_rule_score"
    if "network" in normalized_type or "traffic" in normalized_type:
        return "network_rule_score"
    return None


def _resolve_rule_candidate_values(rule_type, matched_values):
    """Choose the most appropriate token group for a given MappingRule type."""
    normalized_type = normalize_artifact_text(rule_type)
    if normalized_type in {"port", "port rule"} or "port" in normalized_type:
        return matched_values["port"]
    if normalized_type in {"extension", "ext"} or "extension" in normalized_type:
        return matched_values["extension"]
    if normalized_type in {"protocol", "service"} or "protocol" in normalized_type:
        return matched_values["protocol"]
    if normalized_type in {"numeric", "number"} or "number" in normalized_type:
        return matched_values["numeric"]
    if any(term in normalized_type for term in {"file", "identity", "system", "context", "network"}):
        return matched_values["token"]
    return matched_values.get(normalized_type, matched_values["token"])


def compute_rule_signal_features(artifact_text, mapping_rules, category_text=""):
    """Summarize MappingRule matches from artifact/category text into ML-friendly features."""
    features = DEFAULT_RULE_SIGNAL_FEATURES.copy()
    if not mapping_rules:
        return features

    combined_parts = [str(artifact_text).strip()]
    if category_text:
        combined_parts.append(str(category_text).strip())
    combined_text = " ".join(part for part in combined_parts if part)
    matched_values = _collect_rule_match_sets(combined_text)
    matched_rule_types = set()

    for raw_rule in mapping_rules:
        rule = _normalize_mapping_rule(raw_rule)
        keyword = rule["keyword"]
        if not keyword:
            continue

        candidate_values = _resolve_rule_candidate_values(rule["rule_type"], matched_values)
        if keyword not in candidate_values:
            continue

        weight = rule["weight"]
        features["rule_score_total"] += weight
        features["matched_rule_count"] += 1
        features["max_rule_weight"] = max(features["max_rule_weight"], weight)
        matched_rule_types.add(rule["rule_type"])

        feature_name = _canonical_rule_feature_name(rule["rule_type"])
        if feature_name:
            features[feature_name] += weight

    features["unique_rule_types_count"] = len(matched_rule_types)
    features["has_port_signal"] = int(features["port_rule_score"] > 0)
    features["has_protocol_signal"] = int(features["protocol_rule_score"] > 0)
    features["has_file_signal"] = int(features["file_rule_score"] > 0)
    features["has_identity_signal"] = int(features["identity_rule_score"] > 0)
    features["has_system_signal"] = int(features["system_rule_score"] > 0)
    features["has_context_signal"] = int(features["context_rule_score"] > 0)
    features["has_network_signal"] = int(features["network_rule_score"] > 0)
    return features


def find_best_matches_with_rules(new_artifact, artifact_records, mapping_rules, top_n=3):
    """Score graph artifacts using MappingRule weights and return ranked matches."""
    if not mapping_rules:
        return []

    artifact_categories = _build_artifact_category_map(artifact_records)
    matched_values = _collect_rule_match_sets(new_artifact)
    target_scores = {}

    for raw_rule in mapping_rules:
        rule = _normalize_mapping_rule(raw_rule)
        target_artifact = rule["target_artifact"]
        keyword = rule["keyword"]
        if not target_artifact or not keyword:
            continue

        candidate_values = _resolve_rule_candidate_values(rule["rule_type"], matched_values)
        if keyword in candidate_values:
            target_scores[target_artifact] = target_scores.get(target_artifact, 0.0) + rule["weight"]

    scored_matches = []
    for target_artifact, score in target_scores.items():
        category = artifact_categories.get(target_artifact, "Unknown")
        scored_matches.append(
            GraphMatchResult(
                input_artifact=new_artifact,
                matched_artifact=target_artifact,
                matched_category=category,
                score=float(score),
            )
        )

    scored_matches.sort(key=lambda item: item.score, reverse=True)
    return scored_matches[:top_n]


def is_strong_rule_based_match(match_result, threshold=RULE_BASED_MATCH_THRESHOLD):
    """Decide whether weighted MappingRule matching is strong enough to trust directly."""
    return match_result is not None and match_result.score >= threshold


def rank_artifact_matches(query, artifact_records, top_n=3):
    """Return ranked artifact matches for a new free-text artifact name."""
    scored_matches = []

    for record in artifact_records:
        artifact_name = str(record.get("artifact", "")).strip()
        category = str(record.get("category", "Unknown")).strip() or "Unknown"
        score = compute_artifact_match_score(query, artifact_name)
        scored_matches.append(
            GraphMatchResult(
                input_artifact=query,
                matched_artifact=artifact_name,
                matched_category=category,
                score=score,
            )
        )

    scored_matches.sort(key=lambda item: item.score, reverse=True)
    return scored_matches[:top_n]


def match_artifact_with_fallback(input_artifact, artifact_records, mapping_rules=None, top_n=3):
    """Try exact and explicit mappings first, then rule-based and fuzzy artifact ranking."""
    exact_match = find_exact_artifact_match(input_artifact, artifact_records)
    if exact_match is not None:
        return [exact_match]

    explicit_match = find_explicit_mapping_match(input_artifact, artifact_records)
    if explicit_match is not None:
        return [explicit_match]

    rule_matches = find_best_matches_with_rules(
        input_artifact,
        artifact_records,
        mapping_rules or [],
        top_n=top_n,
    )
    best_rule_match = rule_matches[0] if rule_matches else None
    if is_strong_rule_based_match(best_rule_match):
        return rule_matches

    return rank_artifact_matches(input_artifact, artifact_records, top_n=top_n)


def find_best_matches(input_artifact, artifact_records, mapping_rules=None, top_n=3):
    """Rank artifacts using MappingRule weights first and fuzzy matching as fallback."""
    return match_artifact_with_fallback(
        input_artifact,
        artifact_records,
        mapping_rules=mapping_rules,
        top_n=top_n,
    )


def match_new_artifact_and_fetch_defenses(connection, new_artifact_name, top_n=3):
    """Match a new artifact name to the graph and return defenses for the matched artifact."""
    artifact_records = connection.fetch_artifacts()
    mapping_rules = connection.fetch_mapping_rules()
    top_matches = match_artifact_with_fallback(
        new_artifact_name,
        artifact_records,
        mapping_rules=mapping_rules,
        top_n=top_n,
    )
    best_match = top_matches[0] if top_matches else None
    defenses = []

    if is_suitable_match(best_match):
        defenses = fetch_candidate_defenses(connection, best_match.matched_artifact)

    return best_match, top_matches, defenses


def resolve_best_match_method(new_artifact, best_match, artifact_records, mapping_rules=None):
    """Describe which matching strategy produced the best artifact match."""
    if best_match is None:
        return "none"

    exact_match = find_exact_artifact_match(new_artifact, artifact_records)
    if exact_match and exact_match.matched_artifact == best_match.matched_artifact:
        return "exact"

    explicit_match = find_explicit_mapping_match(new_artifact, artifact_records)
    if explicit_match and explicit_match.matched_artifact == best_match.matched_artifact:
        return "explicit_mapping"

    rule_matches = find_best_matches_with_rules(
        new_artifact,
        artifact_records,
        mapping_rules or [],
        top_n=1,
    )
    if rule_matches and rule_matches[0].matched_artifact == best_match.matched_artifact:
        return "rule_based"

    return "similarity"


def ensure_new_artifact_best_match(connection, new_artifact_name, artifact_records, mapping_rules=None):
    """Ensure a NewArtifact node exists and has a BEST_MATCH relation when possible."""
    connection.ensure_new_artifact_node(new_artifact_name)

    exact_match = find_exact_artifact_match(new_artifact_name, artifact_records)
    if exact_match is not None:
        connection.create_or_update_best_match(
            new_artifact_name,
            exact_match.matched_artifact,
            exact_match.score,
            "exact",
        )
        return {
            "best_match": exact_match,
            "top_matches": [exact_match],
            "status": "exact_best_match",
            "message": (
                f"Applied exact BEST_MATCH: {exact_match.matched_artifact} "
                f"(score={exact_match.score:.2f})."
            ),
            "match_method": "exact",
        }

    explicit_match = find_explicit_mapping_match(new_artifact_name, artifact_records)
    if explicit_match is not None:
        connection.create_or_update_best_match(
            new_artifact_name,
            explicit_match.matched_artifact,
            explicit_match.score,
            "explicit_mapping",
        )
        return {
            "best_match": explicit_match,
            "top_matches": [explicit_match],
            "status": "explicit_best_match",
            "message": (
                f"Applied explicit BEST_MATCH: {explicit_match.matched_artifact} "
                f"(score={explicit_match.score:.2f})."
            ),
            "match_method": "explicit_mapping",
        }

    existing_match = connection.fetch_new_artifact_best_match(new_artifact_name)
    if existing_match:
        relation_properties = existing_match.get("relation_properties", {}) or {}
        best_match = GraphMatchResult(
            input_artifact=new_artifact_name,
            matched_artifact=str(existing_match.get("artifact", "")).strip(),
            matched_category=str(existing_match.get("category", "Unknown")).strip() or "Unknown",
            score=float(relation_properties.get("score", 0.0) or 0.0),
        )
        return {
            "best_match": best_match,
            "top_matches": [best_match],
            "status": "existing_best_match",
            "message": (
                f"Reused saved BEST_MATCH: {best_match.matched_artifact} "
                f"(score={best_match.score:.2f})."
            ),
            "match_method": str(relation_properties.get("method", "graph")).strip() or "graph",
        }

    top_matches = find_best_matches(
        new_artifact_name,
        artifact_records,
        mapping_rules=mapping_rules,
        top_n=3,
    )
    best_match = top_matches[0] if top_matches else None

    if not is_suitable_match(best_match):
        return {
            "best_match": None,
            "top_matches": top_matches,
            "status": "no_reliable_match",
            "message": (
                "No reliable artifact match was found using exact, explicit, rule-based, "
                "or similarity fallback logic."
            ),
            "match_method": "none",
        }

    match_method = resolve_best_match_method(
        new_artifact_name,
        best_match,
        artifact_records,
        mapping_rules=mapping_rules,
    )
    connection.create_or_update_best_match(
        new_artifact_name,
        best_match.matched_artifact,
        best_match.score,
        match_method,
    )
    return {
        "best_match": best_match,
        "top_matches": top_matches,
        "status": "created_best_match",
        "message": (
            f"Created BEST_MATCH from NewArtifact to Artifact using {match_method} matching."
        ),
        "match_method": match_method,
    }


def is_suitable_match(match_result, threshold=0.40):
    """Use a simple threshold to reject weak matches."""
    return match_result is not None and match_result.score >= threshold


def build_attack_feature_rows(
    matched_artifact,
    matched_category,
    candidate_attacks,
    csv_data,
    mapping_rules=None,
):
    """Create ML-ready candidate rows using graph attacks, CSV statistics, and rule features."""
    artifact_features_df = csv_data["artifact_features"].copy()
    attack_pairs_df = csv_data["artifact_attack_pairs"].copy()
    tactics_df = csv_data["attack_tactics"].copy()
    candidate_dataset_df = csv_data["attack_candidate_dataset"].copy()

    artifact_features_df["artifact"] = artifact_features_df["artifact"].astype(str).str.strip()
    artifact_features_df["category"] = artifact_features_df["category"].astype(str).str.strip()
    attack_pairs_df["artifact"] = attack_pairs_df["artifact"].astype(str).str.strip()
    attack_pairs_df["category"] = attack_pairs_df["category"].astype(str).str.strip()
    attack_pairs_df["attack"] = attack_pairs_df["attack"].astype(str).str.strip()
    tactics_df["attack"] = tactics_df["attack"].astype(str).str.strip()
    tactics_df["tactic"] = tactics_df["tactic"].astype(str).str.strip()

    artifact_feature_row = artifact_features_df[
        artifact_features_df["artifact"].str.lower() == matched_artifact.lower()
    ]

    if artifact_feature_row.empty:
        raise ValueError(
            f"Matched artifact not found in artifact_features.csv: {matched_artifact}"
        )

    artifact_feature_row = artifact_feature_row.iloc[0]

    tactic_map = (
        tactics_df.drop_duplicates(subset=["attack"])
        .set_index("attack")["tactic"]
        .to_dict()
    )
    attack_global_freq = attack_pairs_df["attack"].value_counts().to_dict()
    same_category_freq = (
        attack_pairs_df.groupby(["category", "attack"])
        .size()
        .to_dict()
    )
    rule_signal_features = compute_rule_signal_features(
        artifact_text=matched_artifact,
        mapping_rules=mapping_rules or [],
        category_text=matched_category,
    )

    attack_rows = []
    for attack_name in sorted(set(candidate_attacks)):
        attack_rows.append(
            {
                "artifact": matched_artifact,
                "category": matched_category,
                "attack": attack_name,
                "tactic": tactic_map.get(attack_name, "Unknown"),
                "attack_count": artifact_feature_row["attack_count"],
                "defense_count": artifact_feature_row["defense_count"],
                "impact_count": artifact_feature_row["impact_count"],
                "similar_count": artifact_feature_row["similar_count"],
                "risk_score": artifact_feature_row["risk_score"],
                "centrality_score": artifact_feature_row["centrality_score"],
                "attack_global_frequency": attack_global_freq.get(attack_name, 0),
                "same_category_frequency": same_category_freq.get(
                    (matched_category, attack_name), 0
                ),
                **rule_signal_features,
            }
        )

    candidate_df = pd.DataFrame(attack_rows)
    if candidate_df.empty:
        raise ValueError("No graph-based attack candidates were available for scoring.")

    reference_columns = [
        column
        for column in candidate_dataset_df.columns
        if column != "label"
    ]
    for column in reference_columns:
        if column not in candidate_df.columns:
            candidate_df[column] = 0

    return candidate_df[reference_columns]


def encode_value_with_fallback(value, encoder, preferred_fallback=None):
    """Encode a single value with safe fallback for unseen classes."""
    classes = list(encoder.classes_)
    if value in classes:
        return encoder.transform([value])[0], value, None

    fallback_candidates = []
    if preferred_fallback:
        fallback_candidates.append(preferred_fallback)
    if "Unknown" in classes:
        fallback_candidates.append("Unknown")

    for candidate in fallback_candidates:
        if candidate in classes:
            encoded_value = encoder.transform([candidate])[0]
            warning = f"Value '{value}' was mapped to fallback '{candidate}'."
            return encoded_value, candidate, warning

    closest_match = max(
        classes,
        key=lambda candidate: SequenceMatcher(None, str(value), str(candidate)).ratio(),
    )
    encoded_value = encoder.transform([closest_match])[0]
    warning = f"Value '{value}' was mapped to closest known value '{closest_match}'."
    return encoded_value, closest_match, warning


def prepare_features_for_scoring(candidate_df, encoders, feature_columns=None):
    """Encode graph-derived attack candidates into the trained model feature space."""
    feature_columns = feature_columns or FEATURE_COLUMNS
    encoded_df = candidate_df.copy()
    warnings = []

    for column in ["artifact", "attack", "category", "tactic"]:
        encoded_values = []
        normalized_values = []
        for value in encoded_df[column].astype(str):
            encoded_value, normalized_value, warning = encode_value_with_fallback(
                value,
                encoders[column],
                preferred_fallback="Unknown" if column == "tactic" else None,
            )
            encoded_values.append(encoded_value)
            normalized_values.append(normalized_value)
            if warning:
                warnings.append(f"{column}: {warning}")

        encoded_df[column] = normalized_values
        encoded_df[f"{column}_enc"] = encoded_values

    return encoded_df[feature_columns], warnings


def score_attack_candidates(model, feature_matrix):
    """Score candidate attacks using probability if the model supports it."""
    if hasattr(model, "predict_proba"):
        return model.predict_proba(feature_matrix)[:, 1]

    if hasattr(model, "decision_function"):
        return model.decision_function(feature_matrix)

    raise ValueError("The saved model does not support probability or score prediction.")


def rank_attack_candidates(model_bundle, encoders, candidate_df, top_n=5):
    """Score graph-derived candidates and return ranked attacks."""
    feature_matrix, warnings = prepare_features_for_scoring(
        candidate_df,
        encoders,
        model_bundle["feature_columns"],
    )
    scored_df = candidate_df.copy()
    scored_df["score"] = score_attack_candidates(model_bundle["model"], feature_matrix)

    ranked_df = (
        scored_df.groupby("attack", as_index=False)["score"]
        .max()
        .sort_values("score", ascending=False)
        .head(top_n)
    )
    return ranked_df, warnings


def fetch_candidate_defenses(connection, artifact_name):
    """Return a sorted list of defense candidates for a matched artifact."""
    records = connection.fetch_defenses_for_artifact(artifact_name)
    return sorted({str(record.get("defense", "")).strip() for record in records if record.get("defense")})


def fetch_reasoning_summary(connection, artifact_name):
    """Return direct attacks, direct tactics, and next tactics for a matched artifact."""
    direct_attack_records = connection.fetch_attacks_for_artifact(artifact_name)
    direct_tactic_records = connection.fetch_direct_tactics_for_artifact(artifact_name)
    next_tactic_records = connection.fetch_next_tactics_for_artifact(artifact_name)

    return {
        "direct_attacks": sorted(
            {
                str(record.get("attack", "")).strip()
                for record in direct_attack_records
                if record.get("attack")
            }
        ),
        "direct_tactics": sorted(
            {
                str(record.get("tactic", "")).strip()
                for record in direct_tactic_records
                if record.get("tactic")
            }
        ),
        "next_tactics": sorted(
            {
                str(record.get("tactic", "")).strip()
                for record in next_tactic_records
                if record.get("tactic")
            }
        ),
    }


def build_unified_prediction_result(
    input_artifact,
    connection,
    csv_data,
    model_bundle,
    encoders,
    match_threshold=0.40,
):
    """Run the shared demo-safe prediction flow for any artifact input."""
    diagnostics = []
    artifact_records = connection.fetch_artifacts()
    if not artifact_records:
        raise ValueError("No Artifact nodes were found in Neo4j.")

    mapping_rules = connection.fetch_mapping_rules()
    resolution = ensure_new_artifact_best_match(
        connection,
        input_artifact,
        artifact_records,
        mapping_rules=mapping_rules,
    )
    diagnostics.append(
        "Checked for an existing NewArtifact node and ensured one exists for the input."
    )
    diagnostics.append(resolution["message"])

    best_match = resolution["best_match"]
    top_matches = resolution["top_matches"]
    result = {
        "input_artifact": input_artifact,
        "best_match": best_match,
        "top_matches": top_matches,
        "match_method": resolution["match_method"],
        "match_confidence": best_match.score if best_match is not None else 0.0,
        "model_name": model_bundle.get("model_name", "best model"),
        "direct_attacks": [],
        "direct_tactics": [],
        "next_tactics": [],
        "ranked_attacks": None,
        "defenses": [],
        "diagnostics": diagnostics,
        "blocked_reason": None,
    }

    if best_match is None or best_match.score < match_threshold:
        result["blocked_reason"] = (
            f"No reliable artifact match found. Minimum confidence threshold is {match_threshold:.2f}."
        )
        diagnostics.append(
            "Prediction was stopped before ML ranking because no reliable artifact match passed the confidence threshold."
        )
        return result

    diagnostics.append(
        f"Using matched Artifact '{best_match.matched_artifact}' via {resolution['match_method']}."
    )

    reasoning = fetch_reasoning_summary(connection, best_match.matched_artifact)
    direct_attacks = reasoning["direct_attacks"]
    direct_tactics = reasoning["direct_tactics"]
    next_tactics = reasoning["next_tactics"]

    result["direct_attacks"] = direct_attacks
    result["direct_tactics"] = direct_tactics
    result["next_tactics"] = next_tactics

    if direct_attacks:
        diagnostics.append(
            f"Found {len(direct_attacks)} direct graph attack candidate(s) for the matched artifact."
        )
    else:
        diagnostics.append(
            f"No direct OFF_REL attacks were found for matched artifact '{best_match.matched_artifact}'."
        )

    if direct_tactics:
        diagnostics.append(
            f"Derived {len(direct_tactics)} direct tactic(s) from graph-linked attacks."
        )
    else:
        diagnostics.append("No direct tactics were derived from the graph.")

    if next_tactics:
        diagnostics.append(
            f"Derived {len(next_tactics)} next tactic(s) using NEXT_TACTIC graph relations."
        )
    else:
        diagnostics.append("No next tactics were derived from the graph.")

    defenses = fetch_candidate_defenses(connection, best_match.matched_artifact)
    result["defenses"] = defenses
    if not defenses:
        diagnostics.append(
            f"No DEF_REL defenses were found for matched artifact '{best_match.matched_artifact}'."
        )

    if not direct_attacks:
        result["blocked_reason"] = (
            "No attack candidates were found in Neo4j for the matched artifact, so ML ranking was skipped."
        )
        diagnostics.append("Prediction was stopped before ML ranking because no direct attacks were available.")
        return result

    candidate_df = build_attack_feature_rows(
        matched_artifact=best_match.matched_artifact,
        matched_category=best_match.matched_category,
        candidate_attacks=direct_attacks,
        csv_data=csv_data,
        mapping_rules=mapping_rules,
    )
    ranked_attacks, warnings = rank_attack_candidates(
        model_bundle,
        encoders,
        candidate_df,
        top_n=5,
    )
    result["ranked_attacks"] = ranked_attacks
    diagnostics.append(
        f"Generated {len(candidate_df)} candidate attack rows and ranked them with the saved ML model."
    )

    if warnings:
        unique_warnings = sorted(set(warnings))
        result["encoding_warnings"] = unique_warnings
        diagnostics.append(
            f"Applied {len(unique_warnings)} encoding fallback note(s) during ML scoring."
        )
    else:
        result["encoding_warnings"] = []

    return result


def print_numbered_section(title, values, empty_message, max_items=None):
    """Print a named section with optional truncation for demo-friendly output."""
    print(f"\n{title}:")
    if not values:
        print(empty_message)
        return

    visible_values = values if max_items is None else values[:max_items]
    for index, value in enumerate(visible_values, start=1):
        print(f"{index}. {value}")

    hidden_count = len(values) - len(visible_values)
    if hidden_count > 0:
        print(f"...and {hidden_count} more")


def print_ranked_attacks_section(ranked_attacks):
    """Print the top predicted attacks if available."""
    print("\nTop 5 Predicted Attacks:")
    if ranked_attacks is None or ranked_attacks.empty:
        print("No attack candidates could be ranked.")
        return

    for index, (_, row) in enumerate(ranked_attacks.iterrows(), start=1):
        print(f"{index}. {row['attack']} ({row['score']:.4f})")


def print_defense_section(defenses):
    """Print graph-derived candidate defenses."""
    print("\nCandidate Defenses:")
    if not defenses:
        print("- No defense candidates found.")
        return

    for defense in defenses:
        print(f"- {defense}")


def print_diagnostics_section(messages):
    """Print clear runtime diagnostics for demo-safe troubleshooting."""
    if not messages:
        return

    print("\nDiagnostics:")
    for message in messages:
        print(f"- {message}")


def render_prediction_report(result):
    """Render the unified jury-safe prediction report."""
    print(f"\nInput Artifact: {result['input_artifact']}")

    if result["best_match"] is None:
        print("Best Matched Artifact: None")
        print("Match Method: none")
        print("Match Confidence / Score: below threshold")
    else:
        print(f"Best Matched Artifact: {result['best_match'].matched_artifact}")
        print(f"Match Method: {result['match_method']}")
        print(f"Match Confidence / Score: {result['match_confidence']:.2f}")

    print("\nTop Matches:")
    if not result["top_matches"]:
        print("No candidate matches found.")
    else:
        for index, match in enumerate(result["top_matches"], start=1):
            print(f"{index}. {match.matched_artifact} ({match.score:.2f})")

    print_numbered_section(
        "Direct Attacks",
        result["direct_attacks"],
        "No direct attacks found.",
        max_items=5,
    )
    print_numbered_section(
        "Direct Tactics",
        result["direct_tactics"],
        "No direct tactics found.",
        max_items=8,
    )
    print_numbered_section(
        "Next Tactics",
        result["next_tactics"],
        "No next tactics found.",
        max_items=3,
    )

    if result.get("model_name"):
        print("\nML Ranking:")
        print(f"(ML-based ranking using the saved {result['model_name']} model)")

    if result["blocked_reason"] is not None:
        print("\nTop 5 Predicted Attacks:")
        print(result["blocked_reason"])
    else:
        print_ranked_attacks_section(result["ranked_attacks"])

    if result.get("encoding_warnings"):
        print("\nEncoding notes:")
        for warning in result["encoding_warnings"]:
            print(f"- {warning}")

    print_defense_section(result["defenses"])
    print_diagnostics_section(result["diagnostics"])
