from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBClassifier
except ImportError:
    XGBClassifier = None


DEFAULT_DATASET_NAME = "technique_candidate_dataset.csv"
DEFAULT_MODEL_NAME = "best_technique_model.joblib"
DEFAULT_REPORT_NAME = "technique_model_comparison.txt"
REQUIRED_COLUMNS = ["technique_name", "attack_count", "tactic_count", "next_tactic_count", "label"]
OPTIONAL_FEATURE_COLUMNS = ["centrality_score", "risk_score"]


def get_project_paths():
    """Resolve project paths relative to the current script."""
    base_dir = Path(__file__).resolve().parents[1]
    data_dir = base_dir / "data"
    results_dir = base_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    return base_dir, data_dir, results_dir


def load_dataset(dataset_path):
    """Load the candidate technique dataset from CSV."""
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    dataframe = pd.read_csv(dataset_path)
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in dataframe.columns]
    if missing_columns:
        missing_text = ", ".join(missing_columns)
        raise ValueError(f"Dataset is missing required columns: {missing_text}")

    return dataframe


def infer_feature_columns(dataframe):
    """Use the baseline numeric features plus optional numeric signals when available."""
    feature_columns = ["attack_count", "tactic_count", "next_tactic_count"]

    for column in OPTIONAL_FEATURE_COLUMNS:
        if column in dataframe.columns:
            feature_columns.append(column)

    extra_numeric_columns = [
        column
        for column in dataframe.select_dtypes(include=["number"]).columns
        if column not in set(feature_columns + ["label"])
    ]
    feature_columns.extend(sorted(extra_numeric_columns))
    return feature_columns


def prepare_feature_matrix(dataframe, feature_columns):
    """Return a clean numeric feature matrix and binary labels."""
    feature_frame = dataframe[feature_columns].copy().fillna(0)
    labels = dataframe["label"].astype(int)

    unique_labels = set(labels.unique())
    if not unique_labels.issubset({0, 1}):
        raise ValueError(
            "This ranking pipeline expects binary labels in the 'label' column (0 or 1)."
        )

    if len(unique_labels) < 2:
        raise ValueError("The dataset must contain both positive and negative labels.")

    return feature_frame, labels


def build_models():
    """Create candidate ranking models for comparison."""
    logistic_model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(max_iter=2000, random_state=42)),
        ]
    )

    random_forest_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        min_samples_split=2,
        min_samples_leaf=1,
        random_state=42,
        n_jobs=-1,
    )

    models = {
        "Logistic Regression": logistic_model,
        "Random Forest": random_forest_model,
    }
    skipped_models = []

    if XGBClassifier is not None:
        models["XGBoost"] = XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            subsample=1.0,
            colsample_bytree=1.0,
            random_state=42,
            n_jobs=-1,
            eval_metric="logloss",
        )
    else:
        skipped_models.append(
            "XGBoost skipped: package not installed. Install with 'pip install xgboost'."
        )

    return models, skipped_models


def score_samples(model, feature_matrix):
    """Return ranking scores from the trained classifier."""
    if hasattr(model, "predict_proba"):
        return model.predict_proba(feature_matrix)[:, 1]

    if hasattr(model, "decision_function"):
        return model.decision_function(feature_matrix)

    raise ValueError("Model does not support probability or decision scores.")


def evaluate_model(model, X_test, y_test):
    """Calculate common binary classification metrics."""
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1_score": f1_score(y_test, y_pred, zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, y_pred),
        "roc_auc": None,
    }

    try:
        y_score = score_samples(model, X_test)
        metrics["roc_auc"] = roc_auc_score(y_test, y_score)
    except ValueError:
        metrics["roc_auc"] = None

    return metrics


def train_and_compare_models(X_train, X_test, y_train, y_test):
    """Train candidate models and return the best one."""
    models, skipped_models = build_models()
    results = []
    trained_models = {}

    for model_name, model in models.items():
        model.fit(X_train, y_train)
        metrics = evaluate_model(model, X_test, y_test)
        results.append({"model_name": model_name, "metrics": metrics})
        trained_models[model_name] = model

    best_result = max(
        results,
        key=lambda item: (
            item["metrics"]["f1_score"],
            item["metrics"]["roc_auc"] if item["metrics"]["roc_auc"] is not None else -1,
        ),
    )
    best_model = trained_models[best_result["model_name"]]
    return results, best_result, best_model, skipped_models


def metrics_to_text(model_name, metrics):
    """Format metrics for console and report output."""
    lines = [
        f"Model: {model_name}",
        f"accuracy: {metrics['accuracy']:.4f}",
        f"precision: {metrics['precision']:.4f}",
        f"recall: {metrics['recall']:.4f}",
        f"f1-score: {metrics['f1_score']:.4f}",
        (
            f"roc-auc: {metrics['roc_auc']:.4f}"
            if metrics["roc_auc"] is not None
            else "roc-auc: not available"
        ),
        "confusion matrix:",
        str(metrics["confusion_matrix"]),
    ]
    return "\n".join(lines)


def write_comparison_report(results, best_result, report_path, skipped_models=None):
    """Write comparison results to a text file."""
    sections = [
        "Technique Model Comparison",
        "==========================",
        "",
    ]

    for result in results:
        sections.append(metrics_to_text(result["model_name"], result["metrics"]))
        sections.append("")

    if skipped_models:
        sections.append("Skipped models:")
        sections.extend(skipped_models)
        sections.append("")

    sections.append(f"Best model: {best_result['model_name']}")

    with open(report_path, "w", encoding="utf-8") as file:
        file.write("\n".join(sections))


def save_model_bundle(model_path, model_name, model, feature_columns):
    """Persist the trained model and metadata with joblib."""
    bundle = {
        "model_name": model_name,
        "model": model,
        "feature_columns": feature_columns,
    }
    joblib.dump(bundle, model_path)


def load_model_bundle(model_path):
    """Load a saved technique ranking model bundle."""
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    return joblib.load(model_path)


def predict_top_techniques(model_bundle, candidate_dataframe, top_n=5):
    """Rank candidate techniques for a new artifact and return the top results."""
    if "technique_name" not in candidate_dataframe.columns:
        raise ValueError("Prediction input must include a 'technique_name' column.")

    feature_columns = model_bundle["feature_columns"]
    missing_columns = [
        column for column in feature_columns if column not in candidate_dataframe.columns
    ]
    if missing_columns:
        missing_text = ", ".join(missing_columns)
        raise ValueError(f"Prediction input is missing required feature columns: {missing_text}")

    feature_matrix = candidate_dataframe[feature_columns].copy().fillna(0)
    scored_df = candidate_dataframe.copy()
    scored_df["score"] = score_samples(model_bundle["model"], feature_matrix)

    ranked_df = (
        scored_df[["technique_name", "score"]]
        .sort_values("score", ascending=False)
        .head(top_n)
        .reset_index(drop=True)
    )
    return ranked_df


def main():
    """Train the technique ranking model and save the best candidate."""
    _, data_dir, results_dir = get_project_paths()
    dataset_path = data_dir / DEFAULT_DATASET_NAME
    model_path = results_dir / DEFAULT_MODEL_NAME
    report_path = results_dir / DEFAULT_REPORT_NAME

    try:
        dataframe = load_dataset(dataset_path)
        print(f"Dataset loaded: {dataset_path}")
        print(f"Dataset shape: {dataframe.shape}")

        feature_columns = infer_feature_columns(dataframe)
        X, y = prepare_feature_matrix(dataframe, feature_columns)

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )

        results, best_result, best_model, skipped_models = train_and_compare_models(
            X_train,
            X_test,
            y_train,
            y_test,
        )

        for result in results:
            print()
            print(metrics_to_text(result["model_name"], result["metrics"]))

        if skipped_models:
            print()
            for skipped_model in skipped_models:
                print(skipped_model)

        save_model_bundle(
            model_path=model_path,
            model_name=best_result["model_name"],
            model=best_model,
            feature_columns=feature_columns,
        )
        write_comparison_report(results, best_result, report_path, skipped_models)

        print()
        print(f"Best model: {best_result['model_name']}")
        print(f"Model saved to: {model_path}")
        print(f"Report saved to: {report_path}")

    except Exception as exc:
        print(f"Technique model training failed: {exc}")


if __name__ == "__main__":
    main()
