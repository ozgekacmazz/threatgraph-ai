"""
Requirements:
- neo4j
- pandas

In single mode this script expects an existing graph artifact name.
New artifact matching is handled by 04_predict_new_artifact_live.py.
"""

import pandas as pd

from utils_live_prediction import Neo4jConnection, get_project_paths


URI = "neo4j://127.0.0.1:7687"
USERNAME = "neo4j"
PASSWORD = "12345678"
NEO4J_DATABASE = "d3fend-kg"


def print_defenses_for_artifact(artifact_name, records):
    """Print defenses for one artifact."""
    defenses = sorted({str(record.get("defense", "")).strip() for record in records if record.get("defense")})
    print(f"\nArtifact: {artifact_name}")
    print("Candidate Defenses:")

    if not defenses:
        print("- No defense candidates found.")
        return

    for defense in defenses:
        print(f"- {defense}")


def export_all_defenses(records, output_path):
    """Export all artifact-defense pairs into a CSV file."""
    df = pd.DataFrame(records)
    if df.empty:
        raise ValueError("No artifact-defense pairs were found in Neo4j.")

    required_columns = ["artifact", "category", "defense"]
    for column in required_columns:
        if column not in df.columns:
            df[column] = "Unknown"

    df = df[required_columns].sort_values(["artifact", "defense"]).drop_duplicates()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"\nDefense export saved: {output_path}")
    print(f"Total rows: {len(df)}")


def prompt_mode():
    """Prompt for script mode in a simple readable way."""
    mode = input("Select mode (single/all): ").strip().lower()
    if mode not in {"single", "all"}:
        raise ValueError("Mode must be 'single' or 'all'.")
    return mode


def main():
    """Fetch defenses for one artifact or export all artifact-defense pairs."""
    _, _, results_dir = get_project_paths()
    output_path = results_dir / "artifact_defense_pairs.csv"
    connection = None

    try:
        mode = prompt_mode()
        connection = Neo4jConnection(URI, USERNAME, PASSWORD, NEO4J_DATABASE)

        if mode == "single":
            artifact_name = input("Enter artifact name: ").strip()
            if not artifact_name:
                raise ValueError("Artifact name cannot be empty.")

            records = connection.fetch_defenses_for_artifact(artifact_name)
            print_defenses_for_artifact(artifact_name, records)
            return

        records = connection.fetch_all_artifact_defense_pairs()
        export_all_defenses(records, output_path)

    except Exception as exc:
        print(f"Defense fetch failed: {exc}")
    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    main()
