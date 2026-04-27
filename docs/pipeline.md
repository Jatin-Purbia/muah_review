# Review Moderation Pipeline

This document traces a single review from the moment it is submitted to the moment it lands in a final state. The pipeline lives in [backend/app/services/review_workflow.py](../backend/app/services/review_workflow.py) and [backend/app/services/fusion.py](../backend/app/services/fusion.py).

## Status state machine

A review carries a `ReviewStatus` ([models/enums.py](../backend/app/models/enums.py)). The machine looks like:

```
                +-------------+
                |  SUBMITTED  |  (transient — only used in the audit log "previous_status")
                +------+------+
                       |
                       v
                +-------------+
                |   QUEUED    |  <-- POST /api/reviews returns here
                +------+------+
                       |
                       v
                +-------------+
                | PROCESSING  |  <-- BackgroundTask picks it up
                +------+------+
                       |
        +--------------+---------------+----------------+
        |              |               |                |
        v              v               v                v
+--------------+ +-------------+ +-------------+ +----------+
|  PUBLISHED   | | PENDING_    | |  REJECTED   | | FLAGGED  |
| (auto)       | | MANUAL_REV  | |             | | (toxic)  |
+------+-------+ +------+------+ +------+------+ +----+-----+
       ^               |                ^             |
       |               |                |             |
       |       Super Admin override paths             |
       +-----------+   v                v             v
                   |  +---------------------+
                   +->|  PUBLISHED /        |  via POST /admin/reviews/{id}/publish|reject|unpublish
                      |  REJECTED /         |
                      |  UNPUBLISHED        |
                      +---------------------+
```

`APPROVED` and `FAILED` exist in the enum but are not currently produced by the pipeline — they are reserved for future use.

## Step-by-step trace

### 1. Submission (`POST /api/reviews`)

[`ReviewWorkflowService.submit_review`](../backend/app/services/review_workflow.py)

1. Validates the payload via the `ReviewCreateRequest` schema (`title`/`description` non-empty, `star_rating` ∈ [1,5]).
2. Creates a `Review` with `status = QUEUED`.
3. For each `media[]` entry, persists a `ReviewMedia` row and collects the IDs onto `review.media_ids`.
4. Writes an audit log: `previous_status=SUBMITTED → new_status=QUEUED`, `action_type=SUBMITTED`.
5. Schedules `process_review(review.id)` as a FastAPI `BackgroundTask`.
6. Returns the `Review` immediately — the client sees `status: "queued"`.

### 2. Background processing (`process_review`)

This runs out-of-band after the HTTP response is sent.

1. **Move to `PROCESSING`** + audit log (`QUEUED → PROCESSING`, `action_type=QUEUED`).
2. **Text analysis** via `OllamaTextAnalysisService.analyze`:
   - Sends two prompts to Qwen 1.5B over Ollama: one for `{sentiment, sentiment_score, toxicity_score, spam_score, summary}`, one for aspects.
   - On JSON-decode failure or Ollama unavailability, falls back to keyword heuristics in `TextAnalysisService` (confidence `0.65` instead of `0.92`).
   - Persists a `ReviewTextAnalysis` row keyed by `review_id`.
3. **Media presence score** — *currently stored, not analyzed*:
   - `media_score = 0.6 if any media else 0.5`. Image/video analysis services exist but are not wired into the workflow yet.
4. **Rating mismatch detection** via `RatingAnalysisService.detect_mismatch`:
   - `rating_score = (star_rating - 1) / 4`
   - `evidence_score = mean(text_score, media_score)`
   - `delta = |rating_score - evidence_score|`
   - `mismatch = delta >= 0.35`
5. **Load `ModerationConfig`** from the repository (super-admin-tunable thresholds).
6. **Fusion decision** — see the next section.
7. **Persist the `ReviewFusionDecision`**, update the review's status to the decided value, set `is_published = (status == PUBLISHED)`.
8. **Final audit log**: `PROCESSING → <decision>`, `action_type=PROCESSED`, with the human-readable `decision_reason`.

### 3. Fusion decision

`FusionModerationService.decide` ([services/fusion.py](../backend/app/services/fusion.py)) is the single place where all signals collapse into one `ReviewStatus`. Rules are evaluated top-to-bottom, first match wins.

1. **Pipeline disabled** (`config.pipeline_enabled = false`): every review goes to `PENDING_MANUAL_REVIEW` with `final_score = 0`. Used when the super admin wants to halt automation.
2. **Toxicity** (`toxicity_score >= toxicity_threshold`, default `0.8`): `FLAGGED`, `final_score = 0.05`.
3. **Spam** (`spam_score >= spam_threshold`, default `0.85`): `REJECTED`, `final_score = 0.1`.
4. **Compute the base score**:
   - `safety_score = 1 - (toxicity * 0.6 + spam * 0.4)`
   - `content_score = text_score * 0.7 + media_score * 0.3`
   - `base_score = content_score * 0.8 + safety_score * 0.2`
5. **Mismatch branch** (rating contradicts text/media):
   - `mismatch_penalty = min(0.2, max(0, delta - 0.35) * 0.6)`
   - `final_score = base_score - mismatch_penalty`
   - **Severe mismatch** (`delta >= 0.50`): `PENDING_MANUAL_REVIEW`.
   - Otherwise the bands below apply, but anything that would otherwise auto-publish is downgraded to `PENDING_MANUAL_REVIEW`.
   - Below `manual_review_threshold` with a mismatch: `REJECTED` with reason "UNRELIABLE".
6. **Media-findings branch** (image/video flags but no text mismatch): always sends `PENDING_MANUAL_REVIEW` regardless of band. *(Not currently triggered because image/video analysis is not invoked in the workflow.)*
7. **Clean path** (no mismatch, no findings):
   - `final_score >= publish_threshold` AND `auto_publish_enabled` → `PUBLISHED`.
   - `final_score >= manual_review_threshold` → `PENDING_MANUAL_REVIEW`.
   - Otherwise → `REJECTED`.

The decision carries an `analytics_payload` with `sentiment`, `summary`, `context`, `base_score`, `final_score`, `mismatch_detected`, `mismatch_severity`, `top_aspects` — surfaced to the frontend via `GET /api/reviews/{id}` and `GET /api/admin/reviews`.

## Manual moderation overrides

Super admins can override the pipeline through three endpoints, each backed by a workflow method:

| Endpoint | Method | New status |
| --- | --- | --- |
| `POST /api/admin/reviews/{id}/publish` | `publish_review` | `PUBLISHED` (`is_published = true`) |
| `POST /api/admin/reviews/{id}/reject` | `reject_review` | `REJECTED` (`is_published = false`) |
| `POST /api/admin/reviews/{id}/unpublish` | `unpublish_review` | `UNPUBLISHED` (`is_published = false`) |
| `DELETE /api/admin/reviews/{id}` | `delete_review` | row removed entirely |

All four require a `ManualModerationRequest` body with `reason` (non-empty) and `actor` (defaults to `"super-admin"`). Each writes an `ActionType.MANUAL_OVERRIDE` audit log entry capturing the reason and the previous status.

## Audit logging

Every status transition — automated or manual — emits a `ModerationLog` via `AuditLogService.log`. The log is exposed inside `GET /api/reviews/{id}` as `moderation_logs[]` and is the system's source of truth for "why is this review where it is".

Recorded fields:
- `review_id`, `action_by` (`"system"` or actor string), `action_type`,
- `previous_status`, `new_status`, `reason`, `timestamp`.

## What runs where

| Stage | Process | Sync vs async |
| --- | --- | --- |
| Submission validation + persistence | FastAPI handler | sync, before HTTP response |
| Audit log "submitted → queued" | FastAPI handler | sync |
| `process_review` | FastAPI BackgroundTask | async w.r.t. the request, but in-process |
| Qwen calls | Ollama HTTP at `:11434` | sync from the workflow's POV |
| Repo writes | InMemory or Astra Data API | sync |

There is no retry, no dead-letter queue, and no idempotency key. A failure mid-pipeline leaves the review in `PROCESSING` with no fusion decision until manual intervention. This is one of the open TODOs in [backend/README.md](../backend/README.md).

## Open / mocked parts of the pipeline

- **Image analysis** (`ImageAnalysisService`) and **video analysis** (`VideoAnalysisService`) classes exist with placeholder heuristics but are **not invoked** by `process_review`. `image_findings=[]` and `video_findings=[]` are passed to the fusion service unconditionally.
- **`MediaScoringService`** is similarly unused — `media_score` is currently a flat `0.6 / 0.5` based on media presence only.
- **Ollama unavailability** silently falls back to keyword scoring with reduced confidence.
- **Authentication / RBAC** is not enforced; any client can hit `/admin/*`.
