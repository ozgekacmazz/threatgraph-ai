"""Random Forest attack ranking service integrated from the uploaded ML pipeline."""

from __future__ import annotations

import logging
import pickle
import re
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

from app.core.config import get_settings
from app.schemas.response_models import AttackPrediction

logger = logging.getLogger(__name__)

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


class MLService:
    """Load model artifacts, prepare live features, and rank top attacks."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.repo_root = Path(__file__).resolve().parents[3]
        self.startup_warnings: list[str] = []
        raw_model_artifact = self._load_pickle(self._resolve_path(self.settings.ml_model_path))
        raw_encoder_artifact = self._load_pickle(self._resolve_path(self.settings.ml_encoders_path))
        self.model_bundle = self._normalize_model_bundle(raw_model_artifact)
        self.encoders = self._normalize_encoders(raw_encoder_artifact, self.model_bundle)
        self.csv_data = self._load_csv_data(self._resolve_path(self.settings.analysis_data_dir))

    def _resolve_path(self, value: str) -> Path:
        """Resolve relative config paths from the repository root for stable deployments."""
        path = Path(value)
        return path if path.is_absolute() else (self.repo_root / path).resolve()

    def _load_pickle(self, file_path: Path):
        """Load a pickle file with logging rather than hard failure at import time."""
        if not file_path.exists():
            warning = f"Required model artifact missing: {file_path}"
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return None
        try:
            with file_path.open("rb") as file:
                return pickle.load(file)
        except Exception as exc:  # pragma: no cover - defensive API fallback
            warning = f"Failed to load pickle artifact '{file_path}': {exc}"
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return None

    def _normalize_model_bundle(self, artifact) -> dict | None:
        """Accept either a dict-like bundle or a raw model object.

        Fallback path:
        If the pickle is malformed or missing required scoring metadata, we keep the service
        alive and let rank_attacks return safe empty results with warnings.
        """
        if artifact is None:
            return None

        if isinstance(artifact, dict):
            model = artifact.get("model")
            feature_columns = artifact.get("feature_columns")
            if model is None:
                warning = "Loaded model bundle is missing the 'model' key."
                logger.warning(warning)
                self.startup_warnings.append(warning)
                return None
            if not isinstance(feature_columns, list) or not feature_columns:
                warning = "Loaded model bundle is missing a valid 'feature_columns' list."
                logger.warning(warning)
                self.startup_warnings.append(warning)
                return None
            return {
                "model_name": artifact.get("model_name", type(model).__name__),
                "model": model,
                "feature_columns": feature_columns,
            }

        # Fallback path: support raw estimator pickles by attaching default feature columns.
        if hasattr(artifact, "predict_proba") or hasattr(artifact, "decision_function"):
            warning = (
                "Model artifact was loaded as a raw model object instead of a bundle. "
                "Using default feature columns for compatibility."
            )
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return {
                "model_name": type(artifact).__name__,
                "model": artifact,
                "feature_columns": FEATURE_COLUMNS,
            }

        warning = "Model artifact is neither a valid bundle nor a supported raw model object."
        logger.warning(warning)
        self.startup_warnings.append(warning)
        return None

    def _normalize_encoders(self, artifact, model_bundle: dict | None) -> dict | None:
        """Validate encoders and optionally recover them from the model bundle.

        Fallback path:
        If standalone encoders are missing but the bundle already carries encoder metadata, use it.
        """
        candidate = artifact
        if candidate is None and isinstance(model_bundle, dict):
            candidate = model_bundle.get("encoders") or model_bundle.get("label_encoder")

        if candidate is None:
            warning = "Label encoder artifact is unavailable."
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return None

        if not isinstance(candidate, dict):
            warning = "Label encoder artifact is not dict-like and cannot be used safely."
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return None

        required_keys = {"artifact", "attack", "category", "tactic"}
        missing_keys = [key for key in required_keys if key not in candidate]
        if missing_keys:
            warning = (
                "Label encoder artifact is missing required encoder keys: "
                + ", ".join(sorted(missing_keys))
            )
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return None

        invalid_keys = [key for key in required_keys if not hasattr(candidate[key], "transform")]
        if invalid_keys:
            warning = (
                "Label encoder artifact contains incompatible encoder objects for: "
                + ", ".join(sorted(invalid_keys))
            )
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return None

        return candidate

    def _load_csv_data(self, data_dir: Path) -> dict[str, pd.DataFrame]:
        """Load CSV files needed for live hybrid prediction."""
        paths = {
            "artifact_features": data_dir / "artifact_features.csv",
            "artifact_attack_pairs": data_dir / "artifact_attack_pairs.csv",
            "attack_tactics": data_dir / "attack_tactics.csv",
            "attack_candidate_dataset": data_dir / "attack_candidate_dataset.csv",
        }

        missing = [str(path) for path in paths.values() if not path.exists()]
        if missing:
            warning = f"Missing ML CSV dependencies: {', '.join(missing)}"
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return {}

        try:
            return {name: pd.read_csv(path) for name, path in paths.items()}
        except Exception as exc:  # pragma: no cover - defensive API fallback
            warning = f"Failed to load ML CSV dependencies from '{data_dir}': {exc}"
            logger.warning(warning)
            self.startup_warnings.append(warning)
            return {}

    def is_available(self) -> bool:
        """Expose whether the full live ML ranking stack is ready."""
        return bool(self.model_bundle and self.encoders and self.csv_data)

    def _collect_runtime_warnings(self) -> list[str]:
        """Return startup-time warnings so API responses stay explainable."""
        return list(self.startup_warnings)

    @staticmethod
    def normalize_text(text: str) -> str:
        normalized = str(text).strip().lower()
        for char in ["/", "-", "_", ",", ".", "(", ")", "[", "]", ":", ";"]:
            normalized = normalized.replace(char, " ")
        return " ".join(normalized.split())

    def _normalize_mapping_rule(self, rule: dict[str, str]) -> dict[str, str | float]:
        keyword = self.normalize_text(rule.get("keyword", ""))
        target_artifact = str(rule.get("target_artifact", "")).strip()
        rule_type = self.normalize_text(rule.get("rule_type", "")) or "token"
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

    def _canonical_rule_feature_name(self, rule_type: str) -> str | None:
        normalized_type = self.normalize_text(rule_type)
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

    def _collect_rule_match_sets(self, artifact_text: str, category_text: str = "") -> dict[str, set[str]]:
        combined_text = " ".join(part for part in [artifact_text.strip(), category_text.strip()] if part)
        normalized = self.normalize_text(combined_text)
        tokens = set(normalized.split())
        numeric_tokens = set(re.findall(r"\b\d+\b", normalized))
        ports = {token for token in numeric_tokens if token.isdigit() and 0 <= int(token) <= 65535}
        extension_tokens = tokens & {"pdf", "doc", "docx", "exe", "dll", "zip", "rar"}
        protocol_tokens = tokens & {"tcp", "udp", "http", "https", "dns", "ssh", "rdp", "smtp"}
        return {
            "token": tokens,
            "keyword": tokens,
            "exact": tokens,
            "numeric": numeric_tokens,
            "number": numeric_tokens,
            "port": ports,
            "extension": extension_tokens,
            "ext": extension_tokens,
            "protocol": protocol_tokens,
            "service": protocol_tokens,
        }

    def _resolve_rule_candidate_values(self, rule_type: str, matched_values: dict[str, set[str]]) -> set[str]:
        normalized_type = self.normalize_text(rule_type)
        if normalized_type in {"port", "port rule"} or "port" in normalized_type:
            return matched_values["port"]
        if normalized_type in {"extension", "ext"} or "extension" in normalized_type:
            return matched_values["extension"]
        if normalized_type in {"protocol", "service"} or "protocol" in normalized_type:
            return matched_values["protocol"]
        if normalized_type in {"numeric", "number"} or "number" in normalized_type:
            return matched_values["numeric"]
        return matched_values.get(normalized_type, matched_values["token"])

    def compute_rule_signal_features(
        self,
        artifact_text: str,
        mapping_rules: list[dict[str, str]],
        category_text: str = "",
    ) -> dict[str, float | int]:
        """Summarize MappingRule matches into ML-ready feature values."""
        features = DEFAULT_RULE_SIGNAL_FEATURES.copy()
        if not mapping_rules:
            return features

        matched_values = self._collect_rule_match_sets(artifact_text, category_text)
        matched_rule_types: set[str] = set()

        for raw_rule in mapping_rules:
            rule = self._normalize_mapping_rule(raw_rule)
            keyword = str(rule["keyword"])
            if not keyword:
                continue

            candidate_values = self._resolve_rule_candidate_values(str(rule["rule_type"]), matched_values)
            if keyword not in candidate_values:
                continue

            weight = float(rule["weight"])
            features["rule_score_total"] += weight
            features["matched_rule_count"] += 1
            features["max_rule_weight"] = max(features["max_rule_weight"], weight)
            matched_rule_types.add(str(rule["rule_type"]))

            feature_name = self._canonical_rule_feature_name(str(rule["rule_type"]))
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

    def build_attack_feature_rows(
        self,
        matched_artifact: str,
        matched_category: str,
        candidate_attacks: list[str],
        mapping_rules: list[dict[str, str]] | None = None,
    ) -> tuple[pd.DataFrame | None, list[str]]:
        """Create candidate rows using the uploaded artifact statistics and graph attacks.

        Fallback path:
        Missing artifact statistics or empty candidate attacks should not crash the API.
        """
        warnings: list[str] = []
        if not self.csv_data:
            return None, ["ML CSV data is unavailable, so candidate feature rows could not be built."]
        if not candidate_attacks:
            return None, ["No candidate attacks were supplied for ML scoring."]

        artifact_features_df = self.csv_data["artifact_features"].copy()
        attack_pairs_df = self.csv_data["artifact_attack_pairs"].copy()
        tactics_df = self.csv_data["attack_tactics"].copy()
        candidate_dataset_df = self.csv_data["attack_candidate_dataset"].copy()

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
            return None, [f"Matched artifact '{matched_artifact}' was not found in artifact_features.csv."]
        artifact_feature_row = artifact_feature_row.iloc[0]

        tactic_map = tactics_df.drop_duplicates(subset=["attack"]).set_index("attack")["tactic"].to_dict()
        attack_global_freq = attack_pairs_df["attack"].value_counts().to_dict()
        same_category_freq = attack_pairs_df.groupby(["category", "attack"]).size().to_dict()
        rule_signal_features = self.compute_rule_signal_features(
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
                    "same_category_frequency": same_category_freq.get((matched_category, attack_name), 0),
                    **rule_signal_features,
                }
            )

        candidate_df = pd.DataFrame(attack_rows)
        if candidate_df.empty:
            return None, ["No graph-based attack candidates were available for scoring."]

        reference_columns = [column for column in candidate_dataset_df.columns if column != "label"]
        for column in reference_columns:
            if column not in candidate_df.columns:
                candidate_df[column] = 0

        return candidate_df[reference_columns], warnings

    @staticmethod
    def encode_value_with_fallback(value, encoder, preferred_fallback: str | None = None):
        """Encode a categorical value with a safe fallback for unseen classes."""
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

        closest_match = max(classes, key=lambda candidate: SequenceMatcher(None, str(value), str(candidate)).ratio())
        encoded_value = encoder.transform([closest_match])[0]
        warning = f"Value '{value}' was mapped to closest known value '{closest_match}'."
        return encoded_value, closest_match, warning

    def prepare_features_for_scoring(
        self,
        candidate_df: pd.DataFrame,
        feature_columns: list[str] | None = None,
    ) -> tuple[pd.DataFrame | None, list[str]]:
        """Encode graph-derived candidate rows into the trained model feature space."""
        feature_columns = feature_columns or FEATURE_COLUMNS
        encoded_df = candidate_df.copy()
        warnings: list[str] = []

        if self.encoders is None:
            return None, ["Label encoders are unavailable, so feature preparation was skipped."]

        missing_source_columns = [
            column for column in ["artifact", "attack", "category", "tactic"] if column not in encoded_df.columns
        ]
        if missing_source_columns:
            return None, [
                "Candidate dataframe is missing required categorical columns: "
                + ", ".join(sorted(missing_source_columns))
            ]

        for column in ["artifact", "attack", "category", "tactic"]:
            encoder = self.encoders.get(column)
            if encoder is None:
                warnings.append(f"Missing encoder for column '{column}'.")
                return None, warnings
            encoded_values = []
            normalized_values = []
            for value in encoded_df[column].astype(str):
                encoded_value, normalized_value, warning = self.encode_value_with_fallback(
                    value,
                    encoder,
                    preferred_fallback="Unknown" if column == "tactic" else None,
                )
                encoded_values.append(encoded_value)
                normalized_values.append(normalized_value)
                if warning:
                    warnings.append(f"{column}: {warning}")

            encoded_df[column] = normalized_values
            encoded_df[f"{column}_enc"] = encoded_values

        missing_feature_columns = [column for column in feature_columns if column not in encoded_df.columns]
        if missing_feature_columns:
            warnings.append(
                "Prepared feature frame is missing required model features: "
                + ", ".join(sorted(missing_feature_columns))
            )
            return None, warnings

        return encoded_df[feature_columns], warnings

    @staticmethod
    def score_attack_candidates(model, feature_matrix: pd.DataFrame):
        """Score candidate attacks using probabilities when available."""
        if hasattr(model, "predict_proba"):
            return model.predict_proba(feature_matrix)[:, 1]
        if hasattr(model, "decision_function"):
            return model.decision_function(feature_matrix)
        raise ValueError("The saved model does not support probability or score prediction.")

    def rank_attacks(
        self,
        matched_artifact: str | None,
        matched_category: str | None,
        direct_attacks: list[str],
        mapping_rules: list[dict[str, str]] | None = None,
    ) -> tuple[list[AttackPrediction], list[str]]:
        """Build live features and return the top-5 ranked attacks from the real model."""
        warnings = self._collect_runtime_warnings()
        if not self.is_available():
            warnings.append("ML model, encoders, or CSV feature sources are unavailable.")
            return [], sorted(set(warnings))
        if not matched_artifact or not matched_category:
            warnings.append("ML scoring skipped because no matched artifact/category was available.")
            return [], sorted(set(warnings))
        if not direct_attacks:
            warnings.append("ML scoring skipped because Neo4j returned no direct attacks.")
            return [], sorted(set(warnings))
        if self.model_bundle is None:
            warnings.append("Validated model bundle is unavailable.")
            return [], sorted(set(warnings))

        candidate_df, candidate_warnings = self.build_attack_feature_rows(
            matched_artifact=matched_artifact,
            matched_category=matched_category,
            candidate_attacks=direct_attacks,
            mapping_rules=mapping_rules,
        )
        warnings.extend(candidate_warnings)
        if candidate_df is None:
            return [], sorted(set(warnings))

        feature_matrix, prepare_warnings = self.prepare_features_for_scoring(
            candidate_df=candidate_df,
            feature_columns=self.model_bundle["feature_columns"],
        )
        warnings.extend(prepare_warnings)
        if feature_matrix is None:
            return [], sorted(set(warnings))

        scored_df = candidate_df.copy()
        try:
            scored_df["score"] = self.score_attack_candidates(self.model_bundle["model"], feature_matrix)
        except Exception as exc:  # pragma: no cover - defensive API fallback
            # Fallback path: model incompatibility or malformed estimator should not crash the API.
            warnings.append(f"ML scoring failed due to model incompatibility or runtime error: {exc}")
            return [], sorted(set(warnings))

        ranked_df = (
            scored_df.groupby("attack", as_index=False)["score"]
            .max()
            .sort_values("score", ascending=False)
            .head(5)
        )
        if ranked_df.empty:
            warnings.append("ML scoring completed but produced no ranked attacks.")
            return [], sorted(set(warnings))

        predictions = [
            AttackPrediction(
                attack_name=str(row["attack"]),
                probability=round(float(row["score"]), 6),
                rationale=f"Ranked by {self.model_bundle.get('model_name', 'saved model')} using graph-derived candidate features.",
            )
            for _, row in ranked_df.iterrows()
        ]
        return predictions, sorted(set(warnings))
