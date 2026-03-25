"""
Unified prediction entry point for artifacts that may already exist in the dataset or graph.

This script intentionally uses the same shared reasoning and output workflow as the
new-artifact live script so the jury/demo experience stays consistent.
"""

from utils_live_prediction import (
    Neo4jConnection,
    build_unified_prediction_result,
    get_project_paths,
    load_csv_data,
    load_pickle,
    load_runtime_settings,
    render_prediction_report,
)


def main():
    """Run the unified prediction workflow for an artifact input."""
    _, data_dir, results_dir = get_project_paths()
    model_path = results_dir / "best_attack_model.pkl"
    encoders_path = results_dir / "attack_label_encoders.pkl"
    settings = load_runtime_settings()

    connection = None

    try:
        artifact_name = input("Enter artifact name: ").strip()
        if not artifact_name:
            raise ValueError("Artifact name cannot be empty.")

        csv_data = load_csv_data(data_dir)
        model_bundle = load_pickle(model_path)
        encoders = load_pickle(encoders_path)

        connection = Neo4jConnection(
            settings["uri"],
            settings["username"],
            settings["password"],
            settings["database"],
        )

        result = build_unified_prediction_result(
            input_artifact=artifact_name,
            connection=connection,
            csv_data=csv_data,
            model_bundle=model_bundle,
            encoders=encoders,
        )

        render_prediction_report(result)

    except Exception as exc:
        print(f"Prediction failed: {exc}")

    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    main()