# Review Moderation Platform — Documentation

This directory contains end-to-end documentation for the multimodal review moderation platform.

The platform is a two-tier application:

- **Backend** — a FastAPI service at `http://localhost:4500` that ingests reviews, runs them through a moderation pipeline (LLM-backed text analysis, rating consistency check, fusion decision), persists state, and exposes admin / seller / internal APIs.
- **Frontend** — an Angular 20 SPA at `http://localhost:4200` that lets a Super Admin and Seller use the same dashboard with two portal views.

## Documentation index

| Doc | What's inside |
| --- | --- |
| [architecture.md](architecture.md) | Component map, layered design, data flow, technology stack |
| [pipeline.md](pipeline.md) | End-to-end review processing pipeline, fusion decision logic, status transitions |
| [api.md](api.md) | Full HTTP API reference with request/response shapes |
| [data-model.md](data-model.md) | Domain models, enums, schemas, persistence shape |
| [moderation-config.md](moderation-config.md) | Tunable thresholds, decision rules, how to change them |
| [frontend.md](frontend.md) | Angular app structure, dashboard portals, services, state |
| [usage.md](usage.md) | Local setup, running, env vars, dev workflow, troubleshooting |

## Quick-start in one screen

```bash
# Backend
cd backend
python -m venv ../venv && source ../venv/Scripts/activate     # Windows
pip install -r requirements.txt
ollama pull qwen2:1.5b                                         # optional but recommended
python main.py                                                 # serves on :4500

# Frontend
cd frontend
npm install
ng serve                                                       # serves on :4200
```

Open `http://localhost:4200` and submit a review from the dashboard. The review will be pushed through the pipeline and appear with a fusion decision within a few seconds.

See [usage.md](usage.md) for the full setup and operational guide.
