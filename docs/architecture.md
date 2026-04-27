# Architecture

The platform is split into two services: a **FastAPI backend** that owns the moderation pipeline and an **Angular frontend** that consumes its HTTP API.

```
+-------------------+        HTTP/JSON         +----------------------+
|   Angular SPA     | <----------------------> |   FastAPI Backend    |
|   (port 4200)     |                          |    (port 4500)       |
+-------------------+                          +----------+-----------+
                                                          |
                                          +---------------+----------------+
                                          |                                |
                                +---------v---------+          +-----------v----------+
                                | Ollama / Qwen2:1.5B|          |   Astra DB / Memory   |
                                | (text analysis)    |          |   (review store)      |
                                +--------------------+          +-----------------------+
```

## Backend layered design

The backend at [backend/app/](../backend/app/) follows a deliberate layered structure:

```
backend/app/
├── api/            HTTP entry points (routes + DI wiring)
├── core/           Settings + configuration loader
├── models/         Pydantic domain objects + enums (ReviewStatus, ActionType, MediaType)
├── schemas/        API request/response DTOs (review, admin, analytics)
├── repositories/   Persistence abstraction (InMemoryRepository, AstraRepository)
└── services/       Business logic (workflow, analysis, fusion, analytics, audit, products, moderation_config)
```

The dependency direction is one-way: `api` → `services` → `repositories` → `models`. Schemas wrap models on the way out, never the other way around.

### Key services

| Service | File | Role |
| --- | --- | --- |
| `ReviewWorkflowService` | [services/review_workflow.py](../backend/app/services/review_workflow.py) | Orchestrates ingestion, processing, manual overrides, deletion |
| `OllamaTextAnalysisService` | [services/analysis.py](../backend/app/services/analysis.py) | Calls Qwen 1.5B via Ollama for sentiment/toxicity/spam/aspects (with keyword fallback) |
| `RatingAnalysisService` | [services/analysis.py](../backend/app/services/analysis.py) | Detects star-rating vs. text-evidence mismatch |
| `FusionModerationService` | [services/fusion.py](../backend/app/services/fusion.py) | Combines all signals into a final `ReviewStatus` decision |
| `ModerationConfigService` | [services/moderation_config.py](../backend/app/services/moderation_config.py) | Reads / patches super-admin thresholds |
| `SellerAnalyticsService` | [services/analytics.py](../backend/app/services/analytics.py) | Per-seller summary, monthly trends, aspect insights |
| `AuditLogService` | [services/audit.py](../backend/app/services/audit.py) | Writes immutable status-transition log entries |
| `ProductCatalogService` | [services/products.py](../backend/app/services/products.py) | Reads `products.json` and exposes a normalized product list |

### Persistence

Two interchangeable repositories implement the `ReviewRepository` Protocol from [repositories/base.py](../backend/app/repositories/base.py):

- `InMemoryRepository` — default; reviews live for the lifetime of the process.
- `AstraRepository` — DataStax Astra DB (Data API) backed, used when `REVIEW_ASTRA_DB_ENABLED=true` and credentials are present.

Both store the entire review aggregate — review, media, text/image/video analysis, fusion decision, and logs — keyed by `review_id`. The Astra implementation packs them into a single `_id` document per review.

### Background processing

`POST /api/reviews` returns `201 Created` immediately and registers `workflow.process_review(review_id)` as a FastAPI `BackgroundTask`. The pipeline runs in-process. There is no Celery/RQ broker yet — see the TODOs in [backend/README.md](../backend/README.md).

## Frontend architecture

[frontend/src/app/](../frontend/src/app/) is a standalone-component Angular 20 application:

```
src/app/
├── app.config.ts           Provides router + HttpClient
├── app.routes.ts           Single route -> DashboardComponent
├── components/
│   ├── dashboard/          Two-portal landing UI (Super Admin / Seller)
│   ├── review-card/        Per-review tile shown in the list
│   ├── review-detail-modal/ Drill-in view with pipeline metadata
│   ├── add-review-modal/   Create-review form
│   └── stats-bar/          Top-of-dashboard counters
├── services/
│   ├── review.service.ts   Wraps /reviews + /admin/reviews + /products
│   └── analytics.service.ts Wraps /seller/{id}/analytics/*
└── models/review.model.ts  Frontend-facing types (Review, Filter, ProductCatalogItem, ...)
```

`environment.apiUrl` is set to `http://localhost:4500/api`. The frontend treats the backend as the single source of truth — no client-side persistence beyond the in-memory dashboard state.

## Technology stack

- **Backend**: Python 3.9+, FastAPI 0.115, Pydantic v2, `pydantic-settings`, `astrapy`, `ollama` Python client, Uvicorn.
- **LLM**: Qwen2 1.5B served locally by Ollama at `http://localhost:11434`.
- **Datastore**: Astra DB (DataStax) via `astrapy` Data API, OR in-process dict.
- **Frontend**: Angular 20, RxJS 7, TypeScript 5.9, Angular CLI build.
- **Product catalog**: static [products.json](../products.json) at the repo root.

## Process & port summary

| Process | Port | Source of truth |
| --- | --- | --- |
| FastAPI app | 4500 | `backend/main.py` → `app.main:app` |
| Angular dev server | 4200 | `frontend/angular.json` |
| Ollama daemon | 11434 | external (installed via ollama.ai) |
| Astra DB | n/a (HTTPS) | optional remote |
