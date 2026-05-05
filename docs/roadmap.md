# Review Analyzer Roadmap

This roadmap turns the current pipeline review into a practical implementation backlog.

It is grouped by delivery stage:

- `Before Demo` means the product should stop over-claiming and feel coherent in front of stakeholders.
- `Before Pilot` means the system becomes safe enough for limited real users.
- `Before Production` means the system becomes durable, secure, measurable, and supportable.

## Completed In This Iteration

The following improvements have already been implemented.

### Backend reliability

- Added failure handling in `process_review()` so a broken run moves the review to `FAILED` instead of leaving it stuck in `PROCESSING`.
- Added an audit entry when processing fails.
- Added soft-delete behavior so deleted reviews are hidden from normal lists but moderation history is preserved.
- Added audit logging for delete actions.

### Analysis quality and traceability

- Added stricter validation for Ollama text-analysis outputs instead of loose best-effort parsing.
- Added explicit analysis metadata:
  - `analysis_mode`
  - `analysis_error`
- Preserved whether a result came from `llm`, `fallback`, or `heuristic` logic.

### Seller-facing truthfulness

- Removed seller-facing signal cards that were assembled from frontend heuristics.
- Added backend-owned seller review insight payloads for seller-scoped review listing.
- Switched the seller portal to consume seller-scoped review data instead of reusing the admin review list.
- Replaced the seller “pipeline signals” panel with grounded review-visibility status cards.

### Test coverage added

- Added backend tests for:
  - clean high-confidence publish decisions
  - toxic review flagging
  - workflow failure moving a review to `FAILED`
  - soft-delete preserving review audit history

### Explicitly not done yet

- Auth and RBAC are still pending by choice for now.
- Real image/video analysis is still not wired into the workflow.
- The queue/worker architecture is still in-process.

## Before Demo

### 1. Make product claims honest

- Remove seller-facing insights that are stitched together from heuristics rather than backend-owned analysis.
- Avoid calling the pipeline fully `multimodal` until image/video evidence is actually part of the decision path.
- Reword seller copy so it explains what the system knows, instead of implying confidence it does not have.

### 2. Cleanly separate seller and super-admin UX

- Keep moderation controls in the super-admin portal only.
- Keep seller screens focused on customer feedback, review visibility state, and admin-review status.
- Remove admin-only language such as pipeline internals, moderation flags, and control terminology from seller-facing surfaces.

### 3. Make pipeline states understandable

- Show explicit review states for `queued`, `processing`, `published`, `manual review`, `blocked`, and `failed`.
- Add a visible fallback state when analysis fails or takes too long.
- Ensure the UI does not leave a review looking silently stuck.

### 4. Seed realistic test data

- Add a small review fixture set that covers:
  - clearly positive reviews
  - clearly negative reviews
  - toxic reviews
  - spammy reviews
  - rating/text mismatch reviews
  - reviews with media attached

## Before Pilot

### 1. Add auth, RBAC, and tenant isolation

- Protect `/admin/*` routes so only authorized super admins can call them.
- Protect seller routes so a seller can only access their own reviews and analytics.
- Remove the frontend dependence on `/admin/reviews` for seller experiences.
- Add a real seller-scoped reviews endpoint for the seller portal.

### 2. Make the pipeline failure-safe

- Wrap `process_review()` in error handling.
- Move failed runs into an explicit `FAILED` status.
- Write an audit log entry for failures.
- Add retry behavior for transient analysis errors.
- Add timeout handling for model calls.

### 3. Improve audit completeness

- Log delete actions before deleting review data.
- Ensure every moderation transition has a durable reason and actor trail.
- Make review history easy to inspect during manual moderation.

### 4. Add backend test coverage

- Unit tests for:
  - text-analysis fallback behavior
  - rating mismatch detection
  - fusion scoring branches
  - threshold boundary decisions
  - manual moderation overrides
- Integration tests for:
  - review submission and processing flow
  - seller analytics summary
  - admin moderation endpoints
  - failure and retry behavior

### 5. Replace frontend-generated insights with backend truth

- Move seller-friendly summaries to the backend if they are part of the product.
- Return structured seller-safe review summaries instead of deriving them ad hoc in Angular.
- Ensure any explanation shown to a seller is reproducible from stored analysis output.

### 6. Improve model handling

- Validate model outputs against a strict schema instead of best-effort JSON parsing.
- Retry or repair malformed outputs before falling back.
- Track how often the system falls back from Ollama to heuristics.
- Store whether each analysis came from the LLM or the fallback path.

## Before Production

### 1. Move to durable asynchronous processing

- Replace in-process FastAPI background tasks with a worker queue.
- Use a real broker/queue system such as Redis plus Celery/RQ or an equivalent worker platform.
- Add retry policies, dead-letter handling, and idempotent processing.

### 2. Replace temporary persistence

- Move off `InMemoryRepository` for all non-trivial environments.
- Use a production-grade database for reviews, analysis artifacts, moderation decisions, and audit logs.
- Add migration/versioning strategy for analysis and moderation records.

### 3. Add real multimodal analysis

- Wire `ImageAnalysisService` into the workflow.
- Wire `VideoAnalysisService` into the workflow.
- Replace placeholder media scoring with actual OCR, ASR, relevance, and defect signals.
- Ensure fusion logic consumes real media findings rather than empty arrays.

### 4. Add moderation quality evaluation

- Build a labeled review dataset.
- Track:
  - precision
  - recall
  - false positive rate
  - false negative rate
  - threshold calibration
- Run regression evaluation before changing prompts, thresholds, or fusion logic.

### 5. Add fraud and trust signals

- Detect duplicate or near-duplicate reviews.
- Detect suspicious review bursts.
- Detect abnormal rating patterns.
- Add account/device/network-based abuse signals where appropriate.
- Treat fraud detection as separate from sentiment classification.

### 6. Add observability and operations tooling

- Monitor:
  - queue depth
  - processing latency
  - model latency
  - failure rate
  - fallback rate
  - moderation outcome distribution
- Add alerts for stuck processing, model unavailability, and elevated failure rates.
- Add dashboards for moderation throughput and reviewer workload.

### 7. Add privacy, compliance, and governance controls

- Define retention policies for reviews, media, and audit logs.
- Define who can access moderation traces and seller analytics.
- Add redaction/masking rules where customer data may appear.
- Version moderation rules and prompts so decisions are traceable over time.

## Suggested Implementation Order

1. Separate seller and admin data access paths.
2. Add auth and RBAC.
3. Add failure handling and full audit coverage.
4. Add backend tests around fusion and moderation state transitions.
5. Move seller-facing summaries to backend-owned outputs.
6. Improve model reliability and output validation.
7. Replace in-process tasks with a durable queue.
8. Add real multimodal analysis.
9. Add evaluation, observability, and abuse detection.

## Current Overall Assessment

- Demo readiness: moderate
- Pilot readiness: low
- Production readiness: very low

The current system is a promising prototype with a clear structure, but it still needs major work in security, reliability, evaluation, and truthfulness of surfaced insights before it should be trusted in real moderation workflows.

## How To Test The Current Improvements

### 1. Run backend tests

From `backend/`:

```bash
python -m unittest discover -s tests -v
```

This should pass:

- fusion publish path
- fusion toxic flag path
- workflow failure to `FAILED`
- delete preserving audit history

### 2. Run the frontend build

From `frontend/`:

```bash
npm run build
```

This confirms the seller/super-admin dashboard changes still compile correctly.

### 3. Manual test: seller portal uses seller-scoped data

1. Start backend and frontend.
2. Open the app.
3. Switch to `Seller Portal`.
4. Pick a seller.
5. Confirm the seller review section shows:
   - review cards
   - seller-safe status labels
   - review visibility cards like `Live on store` and `Waiting on admin`
6. Confirm seller view does not show publish/block/delete actions.

### 4. Manual test: super-admin still manages moderation

1. Switch to `Super Admin`.
2. Open the review management section.
3. Confirm:
   - bulk publish/hide still works
   - per-review publish/hide still works
   - moderation controls remain available only there

### 5. Manual test: failure handling

To simulate a degraded analyzer path:

1. Stop Ollama or point the backend to an unavailable Ollama host.
2. Submit a review.
3. Confirm one of these happens:
   - fallback analysis is used and the review still completes
   - if processing throws, the review moves to `FAILED` instead of remaining in `PROCESSING`

### 6. Manual test: soft delete

1. Delete a review from the super-admin side.
2. Confirm it disappears from the normal review lists.
3. Confirm backend tests still prove the record is soft-deleted and its audit trail is preserved.
