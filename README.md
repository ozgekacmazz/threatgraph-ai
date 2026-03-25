# Cyber KG ML System

Production-quality academic scaffold for a cybersecurity analysis platform with:

- FastAPI backend
- React frontend
- Neo4j knowledge graph access layer
- Rule-based and similarity-based mapping
- Attack reasoning hooks
- Random Forest ranking hooks
- Defense recommendation hooks
- Low-confidence abstention handling
- `.env` configuration and logging

## Folder structure

```text
cyber-kg-ml-system/
|-- analysis/
|   |-- artifacts/
|   |-- models/
|   `-- README.md
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   `-- routes.py
|   |   |-- core/
|   |   |   |-- config.py
|   |   |   `-- logging_config.py
|   |   |-- db/
|   |   |   `-- neo4j_client.py
|   |   |-- schemas/
|   |   |   |-- request_models.py
|   |   |   `-- response_models.py
|   |   |-- services/
|   |   |   |-- analysis_service.py
|   |   |   |-- defense_service.py
|   |   |   |-- mapping_service.py
|   |   |   |-- ml_service.py
|   |   |   `-- reasoning_service.py
|   |   |-- utils/
|   |   |   `-- helpers.py
|   |   `-- main.py
|   |-- .env.example
|   `-- requirements.txt
|-- docs/
|   `-- example_api_call.md
|-- frontend/
|   |-- .env.example
|   |-- package.json
|   |-- vite.config.js
|   `-- src/
`-- README.md
```

## Backend start

Run these commands from the repository root:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Backend dev URL:

```text
http://localhost:8000
```

## Frontend start

Important: `npm run dev` must be run inside `frontend/`, not inside `backend/`.

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Frontend dev URL:

```text
http://localhost:5173
```

## Frontend env

Expected Vite variable:

```text
VITE_API_BASE_URL=http://localhost:8000/api
```

The frontend reads this variable from `frontend/.env` and falls back to
`http://localhost:8000/api` when it is missing.

## Integration flow

### Analysis request

`/analiz` sends:

```json
{
  "artifact_name": "...",
  "description": "...",
  "analysis_mode": "new"
}
```

or

```json
{
  "artifact_name": "...",
  "description": "...",
  "analysis_mode": "known"
}
```

### Graph request

After a successful analysis, the frontend requests graph context with:

```json
{
  "artifact_name": "...",
  "matched_artifact": "...",
  "analysis_mode": "new"
}
```

`matched_artifact` is taken from the analysis response when available.

## Notes

- The scaffold does not fabricate attack or mitigation data.
- Frontend routes remain:
  - `/`
  - `/analiz`
  - `/mimari`
  - `/graf`
  - `/senaryolar`
- Live graph rendering uses `reactflow`.
