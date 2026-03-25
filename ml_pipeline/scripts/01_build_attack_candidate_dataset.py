"""Build the attack candidate dataset and enrich it with MappingRule-derived features."""

import random
from pathlib import Path

import pandas as pd

from utils_live_prediction import (
    DEFAULT_RULE_SIGNAL_FEATURES,
    Neo4jConnection,
    compute_rule_signal_features,
)


random.seed(42)

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

URI = "neo4j://127.0.0.1:7687"
USERNAME = "neo4j"
PASSWORD = "12345678"
NEO4J_DATABASE = "d3fend-kg"


def clean_dataframe_strings(dataframe):
    """Trim whitespace and strip quote characters from string columns."""
    cleaned_df = dataframe.copy()
    cleaned_df.columns = cleaned_df.columns.str.strip()

    for column in cleaned_df.columns:
        if cleaned_df[column].dtype == object:
            cleaned_df[column] = (
                cleaned_df[column]
                .astype(str)
                .str.strip()
                .str.replace('"', "", regex=False)
            )

    return cleaned_df


def load_input_data():
    """Load the CSV inputs used to build positive and negative attack samples."""
    artifact_features = clean_dataframe_strings(
        pd.read_csv(DATA_DIR / "artifact_features.csv")
    )
    artifact_attack_pairs = clean_dataframe_strings(
        pd.read_csv(DATA_DIR / "artifact_attack_pairs.csv")
    )
    attack_tactics = clean_dataframe_strings(
        pd.read_csv(DATA_DIR / "attack_tactics.csv")
    )
    return artifact_features, artifact_attack_pairs, attack_tactics


def load_mapping_rules():
    """Load MappingRule records from Neo4j; fall back to an empty list if unavailable."""
    connection = None

    try:
        connection = Neo4jConnection(URI, USERNAME, PASSWORD, NEO4J_DATABASE)
        mapping_rules = connection.fetch_mapping_rules()
        print(f"Mapping rules loaded from Neo4j: {len(mapping_rules)}")
        return mapping_rules
    except Exception as exc:
        print(f"Mapping rules could not be loaded from Neo4j: {exc}")
        print("Dataset generation will continue with zero-valued rule features.")
        return []
    finally:
        if connection is not None:
            connection.close()


def build_artifact_rule_feature_table(artifact_features, mapping_rules):
    """Compute one reusable MappingRule feature vector per artifact/category pair."""
    rule_rows = []

    for _, row in artifact_features.iterrows():
        artifact_name = str(row.get("artifact", "")).strip()
        category_name = str(row.get("category", "Unknown")).strip() or "Unknown"
        feature_values = compute_rule_signal_features(
            artifact_text=artifact_name,
            mapping_rules=mapping_rules,
            category_text=category_name,
        )
        rule_rows.append(
            {
                "artifact": artifact_name,
                "category": category_name,
                **feature_values,
            }
        )

    if not rule_rows:
        return pd.DataFrame(
            [{"artifact": "", "category": "", **DEFAULT_RULE_SIGNAL_FEATURES}]
        ).iloc[0:0]

    return pd.DataFrame(rule_rows).drop_duplicates(subset=["artifact", "category"])


def add_shared_features(candidate_df, artifact_features, attack_tactics, artifact_attack_pairs):
    """Attach tactic, artifact metrics, graph frequencies, and rule-signal features."""
    enriched_df = candidate_df.merge(attack_tactics, on="attack", how="left")
    enriched_df["tactic"] = enriched_df["tactic"].fillna("Unknown")

    enriched_df = enriched_df.merge(
        artifact_features,
        on=["artifact", "category"],
        how="left",
    )

    attack_global_freq = artifact_attack_pairs["attack"].value_counts().to_dict()
    same_category_freq = (
        artifact_attack_pairs.groupby(["category", "attack"])
        .size()
        .to_dict()
    )

    enriched_df["attack_global_frequency"] = enriched_df["attack"].map(attack_global_freq)
    enriched_df["same_category_frequency"] = enriched_df.apply(
        lambda row: same_category_freq.get((row["category"], row["attack"]), 0),
        axis=1,
    )
    return enriched_df


def build_negative_samples(artifact_attack_pairs):
    """Sample negative artifact-attack combinations using the existing project heuristic."""
    all_attacks = sorted(artifact_attack_pairs["attack"].unique())
    artifact_to_attacks = (
        artifact_attack_pairs.groupby("artifact")["attack"]
        .apply(set)
        .to_dict()
    )
    artifact_to_category = (
        artifact_attack_pairs.groupby("artifact")["category"]
        .first()
        .to_dict()
    )

    negative_rows = []
    for artifact, linked_attacks in artifact_to_attacks.items():
        category = artifact_to_category[artifact]
        negative_pool = [attack for attack in all_attacks if attack not in linked_attacks]
        sample_size = min(len(negative_pool), len(linked_attacks) * 2)
        sampled_negatives = random.sample(negative_pool, sample_size)

        for attack in sampled_negatives:
            negative_rows.append(
                {
                    "artifact": artifact,
                    "category": category,
                    "attack": attack,
                    "label": 0,
                }
            )

    return pd.DataFrame(negative_rows)


def finalize_dataset(positive_df, negative_df, artifact_rule_features):
    """Combine all samples and append the reusable MappingRule feature columns."""
    final_df = pd.concat([positive_df, negative_df], ignore_index=True)
    final_df = final_df.merge(
        artifact_rule_features,
        on=["artifact", "category"],
        how="left",
    )

    for column, default_value in DEFAULT_RULE_SIGNAL_FEATURES.items():
        if column not in final_df.columns:
            final_df[column] = default_value
        else:
            final_df[column] = final_df[column].fillna(default_value)

    ordered_columns = [
        "artifact",
        "category",
        "attack",
        "tactic",
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
        "label",
    ]
    return final_df[ordered_columns]


def main():
    """Regenerate attack_candidate_dataset.csv with MappingRule-based artifact features."""
    artifact_features, artifact_attack_pairs, attack_tactics = load_input_data()
    mapping_rules = load_mapping_rules()
    artifact_rule_features = build_artifact_rule_feature_table(
        artifact_features,
        mapping_rules,
    )

    positive_df = artifact_attack_pairs.copy()
    positive_df["label"] = 1
    positive_df = add_shared_features(
        positive_df,
        artifact_features,
        attack_tactics,
        artifact_attack_pairs,
    )

    negative_df = build_negative_samples(artifact_attack_pairs)
    negative_df = add_shared_features(
        negative_df,
        artifact_features,
        attack_tactics,
        artifact_attack_pairs,
    )

    final_df = finalize_dataset(positive_df, negative_df, artifact_rule_features)

    output_path = DATA_DIR / "attack_candidate_dataset.csv"
    final_df.to_csv(output_path, index=False, encoding="utf-8-sig")

    print("Dataset file created:", output_path)
    print("Total rows:", len(final_df))
    print("Positive samples:", int((final_df["label"] == 1).sum()))
    print("Negative samples:", int((final_df["label"] == 0).sum()))
    print(final_df.head())


if __name__ == "__main__":
    main()
