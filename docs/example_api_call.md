# Example API Call

```bash
curl -X POST "http://localhost:8000/api/analyze" ^
  -H "Content-Type: application/json" ^
  -d "{\"artifact_name\":\"powershell.exe\",\"description\":\"Suspicious scripted execution observed on a workstation\"}"
```

Expected response shape:

```json
{
  "input_artifact": "powershell.exe",
  "matched_artifact": "powershell.exe",
  "mapping_method": "normalized_input",
  "confidence_score": 0.5,
  "confidence_label": "low",
  "direct_attacks": [],
  "direct_tactics": [],
  "next_tactics": [],
  "predicted_attacks_top5": [],
  "defense_suggestions": [
    {
      "title": "Complete ML deployment",
      "description": "Deploy the trained Random Forest model and feature pipeline to enable ranked attack predictions and stronger recommendation quality.",
      "source": "system_diagnostic"
    }
  ],
  "low_confidence_reason": "Mapping confidence 0.50 is below the abstention threshold 0.55. Neo4j reasoning did not return direct attacks or tactics. The ML layer did not produce reliable attack rankings.",
  "diagnostics": {
    "normalized_artifact": "powershell.exe",
    "normalized_description": "suspicious scripted execution observed on a workstation",
    "thresholds": {
      "low_confidence_threshold": 0.55,
      "strict_prediction_threshold": 0.7
    },
    "warnings": [],
    "processing_steps": [],
    "data_sources": {
      "neo4j": "not_configured",
      "ml_model": "not_loaded"
    }
  }
}
```
