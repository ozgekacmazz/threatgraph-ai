import pickle
from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import KNeighborsClassifier
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
from sklearn.preprocessing import LabelEncoder, StandardScaler

from utils_live_prediction import FEATURE_COLUMNS

try:
    from xgboost import XGBClassifier
except ImportError:
    XGBClassifier = None


def get_project_paths():
    """Resolve project paths relative to the current script."""
    base_dir = Path(__file__).resolve().parents[1]
    data_dir = base_dir / "data"
    results_dir = base_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    return base_dir, data_dir, results_dir


def load_dataset(dataset_path):
    """Load the exported candidate dataset from CSV."""
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    return pd.read_csv(dataset_path)


def fit_label_encoders(dataframe, categorical_columns):
    """Fit encoders and append encoded columns to the dataframe."""
    encoders = {}
    encoded_df = dataframe.copy()

    for column in categorical_columns:
        encoder = LabelEncoder()
        encoded_column = f"{column}_enc"
        encoded_df[encoded_column] = encoder.fit_transform(encoded_df[column].astype(str))
        encoders[column] = encoder

    return encoded_df, encoders


def prepare_features(dataframe):
    """Prepare model features and target."""
    categorical_columns = ["artifact", "attack", "category", "tactic"]
    encoded_df, encoders = fit_label_encoders(dataframe, categorical_columns)
    feature_columns = list(FEATURE_COLUMNS)

    X = encoded_df[feature_columns]
    y = encoded_df["label"]
    return X, y, feature_columns, encoders


def evaluate_model(model, X_test, y_test):
    """Calculate common classification metrics."""
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1_score": f1_score(y_test, y_pred, zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, y_pred),
        "roc_auc": None,
    }

    if hasattr(model, "predict_proba"):
        y_score = model.predict_proba(X_test)[:, 1]
        metrics["roc_auc"] = roc_auc_score(y_test, y_score)
    elif hasattr(model, "decision_function"):
        y_score = model.decision_function(X_test)
        metrics["roc_auc"] = roc_auc_score(y_test, y_score)

    return metrics


def build_models():
    """Create candidate models for comparison."""
    logistic_model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    max_iter=2000,
                    random_state=42,
                ),
            ),
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

    knn_model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("classifier", KNeighborsClassifier(n_neighbors=5)),
        ]
    )

    models = {
        "Logistic Regression": logistic_model,
        "Random Forest": random_forest_model,
        "KNN": knn_model,
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


def metrics_to_text(model_name, metrics):
    """Format metrics for terminal and file output."""
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


def save_pickle(file_path, obj):
    """Persist a Python object with pickle."""
    with open(file_path, "wb") as file:
        pickle.dump(obj, file)


def train_and_compare_models(X_train, X_test, y_train, y_test):
    """Train candidate models and return the best one."""
    results = []
    trained_models = {}
    models, skipped_models = build_models()

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


def write_comparison_report(results, best_result, report_path, skipped_models=None):
    """Write all model results to a text file."""
    sections = [
        "Attack Model Comparison",
        "=======================",
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


def main():
    """Train attack ranking models and save the best one."""
    _, data_dir, results_dir = get_project_paths()
    dataset_path = data_dir / "attack_candidate_dataset.csv"

    try:
        df = load_dataset(dataset_path)
        print(f"Dataset loaded: {dataset_path}")
        print(f"Dataset shape: {df.shape}")

        X, y, feature_columns, encoders = prepare_features(df)
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )

        results, best_result, best_model, skipped_models = train_and_compare_models(
            X_train, X_test, y_train, y_test
        )

        for result in results:
            print()
            print(metrics_to_text(result["model_name"], result["metrics"]))

        if skipped_models:
            print()
            for skipped_model in skipped_models:
                print(skipped_model)

        model_bundle = {
            "model_name": best_result["model_name"],
            "model": best_model,
            "feature_columns": feature_columns,
        }

        save_pickle(results_dir / "best_attack_model.pkl", model_bundle)
        save_pickle(results_dir / "attack_label_encoders.pkl", encoders)
        write_comparison_report(
            results,
            best_result,
            results_dir / "model_comparison.txt",
            skipped_models=skipped_models,
        )

        print()
        print(f"Best model: {best_result['model_name']}")
        print(f"Results saved to: {results_dir}")
        print("best model saved")

    except Exception as exc:
        print(f"Training failed: {exc}")


if __name__ == "__main__":
    main()
