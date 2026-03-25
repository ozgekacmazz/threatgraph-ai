# Analysis Layer

This directory is reserved for analysis-specific assets that are independent from the web stack:

- `models/` for trained ML artifacts such as the Random Forest model
- `artifacts/` for canonical artifact catalogs, mapping dictionaries, or exported graph-aligned resources

The FastAPI backend orchestrates this logic through `backend/app/services`, while this folder stores the reusable analysis assets themselves.
