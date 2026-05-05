# Usage Guide

This is the operational handbook: prerequisites, setup, running, env vars, dev workflows, smoke tests, and troubleshooting.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Python | 3.9+ | FastAPI backend |
| Node.js | 18+ | Angular dev server |
| npm | 9+ | Frontend dependencies |
| Ollama | latest | Local LLM runtime (optional but recommended) |
| Astra DB | optional | Persistence beyond a process restart |

Disk: ~1–2 GB for the Qwen 1.5B model (~1 GB) + `node_modules` (~500 MB).

## First-time setup

### 1. Clone & enter the repo

```bash
cd c:/Desktop/review
```

### 2. Backend — Python virtualenv

```bash
python -m venv venv
# Windows:
source venv/Scripts/activate
# macOS/Linux:
source venv/bin/activate

cd backend
pip install -r requirements.txt
```

### 3. Backend — install Ollama and the Qwen model

The pipeline uses Qwen 1.5B for text analysis. If you skip this, the workflow falls back to keyword scoring with reduced confidence (`0.65`) — it works, just less well.

1. Install Ollama from <https://ollama.ai>.
2. Pull the model (one-time, ~1 GB):

```bash
ollama pull qwen2:1.5b
```

3. Verify Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

You should see `qwen2:1.5b` listed.

### 4. Backend — env file (optional)

Create `backend/.env` to override defaults. None are required — the service boots without it. See [Environment variables](#environment-variables) below.

### 5. Frontend — install dependencies

```bash
cd ../frontend
npm install
```

## Running the stack

Open two terminals.

### Terminal 1 — backend (port 4500)

```bash
source venv/Scripts/activate
cd backend
python main.py
# or, equivalently:
# uvicorn app.main:app --reload --port 4500
```

You should see Uvicorn start on `http://0.0.0.0:4500`. The interactive OpenAPI docs are at `http://localhost:4500/docs`.

### Terminal 2 — frontend (port 4200)

```bash
cd frontend
ng serve
```

Open `http://localhost:4200`.

## Smoke test (5 commands)

```bash
# 1. Health
curl http://localhost:4500/api/health
# {"status":"ok"}

# 2. Submit a review
curl -X POST http://localhost:4500/api/reviews \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "user-1",
    "seller_id": "seller-1",
    "product_id": "prod-1",
    "title": "Great product",
    "description": "Loved the quality and the delivery was fast",
    "star_rating": 5,
    "media": []
  }'
# Note the returned id.

# 3. Wait ~3 seconds for Qwen to finish, then fetch the result
curl http://localhost:4500/api/reviews/<id-from-step-2>

# 4. Inspect the moderation config
curl http://localhost:4500/api/admin/moderation-config

# 5. List all reviews from the admin view (what the dashboard uses)
curl http://localhost:4500/api/admin/reviews
```

If step 3 returns `status: "queued"` or `"processing"`, wait a moment and retry — the BackgroundTask runs in-process.

## Environment variables

All backend env vars use the `REVIEW_` prefix. They are loaded by [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) from `backend/.env` and the process environment.

```env
# App identity
REVIEW_APP_NAME=Review Moderation Service
REVIEW_APP_VERSION=1.0.0

# CORS — comma-separated origins
REVIEW_CORS_ORIGINS=http://localhost:4200

# Moderation defaults (used to seed the config row on first boot)
REVIEW_MODERATION_AUTO_PUBLISH_ENABLED=true
REVIEW_MODERATION_PIPELINE_ENABLED=true
REVIEW_MODERATION_PUBLISH_THRESHOLD=0.75
REVIEW_MODERATION_MANUAL_REVIEW_THRESHOLD=0.45
REVIEW_MODERATION_TOXICITY_THRESHOLD=0.8
REVIEW_MODERATION_SPAM_THRESHOLD=0.85

# Ollama
REVIEW_OLLAMA_HOST=http://localhost:11434
REVIEW_OLLAMA_MODEL=qwen2:1.5b

# Astra DB (off by default → uses InMemoryRepository)
REVIEW_ASTRA_DB_ENABLED=false
REVIEW_ASTRA_DB_ENDPOINT=
REVIEW_ASTRA_DB_TOKEN=
```

To enable Astra DB:

```env
REVIEW_ASTRA_DB_ENABLED=true
REVIEW_ASTRA_DB_ENDPOINT=https://<db-id>-<region>.apps.astra.datastax.com
REVIEW_ASTRA_DB_TOKEN=AstraCS:...
```

The repo factory in [api/deps.py](../backend/app/api/deps.py) flips between the two implementations based on `astra_db_enabled` AND both creds being present.

The frontend has a single config in [environments/environment.ts](../frontend/src/environments/environment.ts) — change `apiUrl` if the backend isn't on `localhost:4500`.

## Common workflows

### Re-run a stuck review

If a review stalls in `processing` (e.g. Ollama crashed mid-pipeline), trigger the pipeline again:

```bash
curl -X POST http://localhost:4500/api/internal/process-review/<review-id>
```

### Switch to a faster Ollama model

```env
REVIEW_OLLAMA_MODEL=qwen2:0.5b   # ~200 MB, faster, less accurate
```

Restart the backend.

### Disable the Qwen pipeline entirely (keyword fallback only)

Easiest: stop the Ollama service. The backend will catch the connection error and fall back to keyword scoring with `confidence_score = 0.65`.

### Clear all reviews (in-memory mode)

Restart the backend. In-memory state is process-scoped.

## Troubleshooting

### Backend won't start — `ModuleNotFoundError`

Activate the venv (`source venv/Scripts/activate`) and re-run `pip install -r requirements.txt` from the `backend/` directory.

### Reviews stay in `queued`

The BackgroundTask never ran. Causes:
- The first request after startup occasionally takes longer because Ollama lazy-loads the model.
- An exception inside `process_review` was swallowed by FastAPI's BackgroundTask runner. Check the backend stdout.
- Ollama is unreachable AND the keyword fallback also raised. Check `curl http://localhost:11434/api/tags`.

Manually re-run via `POST /api/internal/process-review/{id}`.

### `confidence_score` is 0.65 instead of 0.92

Ollama is unavailable or returned non-JSON. The pipeline silently fell back to keyword scoring. Verify:

```bash
curl http://localhost:11434/api/tags
ollama run qwen2:1.5b "Hello"
```

### Frontend shows "Failed to load reviews"

Open DevTools → Network. Likely:
- Backend not running on `:4500`. Start it.
- CORS rejected the origin. Check `REVIEW_CORS_ORIGINS` includes whatever URL the frontend is on.
- Backend returned 5xx. Check backend stdout.

### Astra DB errors at startup

`AstraRepository.__init__` calls the Data API immediately to ensure collections and the config doc. If creds are wrong, you'll see an `astrapy` exception. Set `REVIEW_ASTRA_DB_ENABLED=false` to fall back to in-memory while you fix the creds.

### `products.json` not found

`ProductCatalogService` reads [products.json](../products.json) from the repo root. The path is computed in [api/deps.py](../backend/app/api/deps.py) via `Path(__file__).resolve().parents[3] / "products.json"`. Run the backend from `backend/` (which is what `python main.py` does) or set up a symlink.

## Production-readiness gaps

These are the things to fix before going beyond local dev:

- **No persistence by default** — switch to Astra DB or replace `InMemoryRepository` with PostgreSQL + SQLAlchemy.
- **No background queue** — `BackgroundTasks` runs in-process and can't survive restart. Move to Celery/RQ + Redis.
- **No real image/video analysis** — placeholder services exist but are not wired into the workflow.
- **No auth** — `/admin/*` endpoints are open. Add an auth layer + RBAC + tenant isolation for `/seller/{id}/*`.
- **No retry / DLQ** — a failure mid-pipeline strands the review in `processing`.
- **No tests** — there is `backend/test_qwen.py` for the LLM integration, nothing else.
- **No observability** — no metrics, structured logs, or tracing.
