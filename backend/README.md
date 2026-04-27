# Backend Review Moderation Service

This backend implements the workflow described in `service_prompt.md` as a modular FastAPI service for multimodal review moderation.

It is designed around three product actors:

- `User`
  submits text, rating, image, and video reviews
- `Seller`
  sees only their own review analytics and review outcomes
- `Super Admin`
  controls moderation settings and can manually override decisions

## What This Service Does

When a review is submitted:

1. The raw review and media metadata are saved
2. The review is marked `queued`
3. A background processing step runs the moderation pipeline
4. The service performs:
   - text analysis
   - rating normalization and mismatch detection
   - image analysis hooks
   - video analysis hooks
5. The fusion layer combines all signals into a moderation decision
6. The review is marked as one of:
   - `published`
   - `pending_manual_review`
   - `rejected`
   - `flagged`
7. Audit logs and seller analytics become available through API endpoints

## Current Implementation Notes

This is a production-shaped scaffold, not the final infra deployment.

What is already implemented:

- FastAPI application factory
- Typed domain models and schemas
- Modular service layer
- Review ingestion workflow
- In-process background processing
- Text, rating, image, and video analysis service interfaces
- Fusion moderation logic with configurable thresholds
- Seller analytics endpoints
- Super admin moderation config endpoints
- Audit log recording

What is still intentionally mocked or simplified:

- Persistence defaults to in-memory unless Astra DB is configured
- Background jobs use FastAPI background tasks, not Celery/Redis yet
- Multimodal AI analysis uses placeholder heuristics, not real model inference yet
- Authentication and authorization are not wired yet

## Project Structure

```text
backend/
  app/
    api/
      deps.py
      routes.py
    core/
      config.py
    models/
      domain.py
      enums.py
    repositories/
      astra.py
      base.py
      memory.py
    schemas/
      admin.py
      analytics.py
      review.py
    services/
      analysis.py
      analytics.py
      audit.py
      fusion.py
      moderation_config.py
      review_workflow.py
    main.py
  .env.example
  main.py
  requirements.txt
```

## Architecture Overview

### `app/api`

Defines HTTP endpoints for:

- review submission and detail
- seller review and analytics views
- super admin moderation actions
- moderation config management
- internal review processing hooks

### `app/models`

Contains core domain objects such as:

- `Review`
- `ReviewMedia`
- `ReviewTextAnalysis`
- `ReviewImageAnalysis`
- `ReviewVideoAnalysis`
- `ReviewFusionDecision`
- `ModerationConfig`
- `ModerationLog`

### `app/schemas`

Pydantic request/response models for:

- review ingestion
- admin moderation actions
- seller analytics payloads

### `app/repositories`

Abstracts persistence. The service can use `InMemoryRepository` for local-only runs or `AstraRepository` to persist data into the Astra DB `reviews` collection.

### `app/services`

Contains the workflow logic:

- `review_workflow.py`
  orchestrates ingestion, queueing, processing, and admin overrides
- `analysis.py`
  contains modality-specific processing services
- `fusion.py`
  combines modality outputs into the final moderation decision
- `moderation_config.py`
  manages super admin configuration
- `analytics.py`
  produces seller-facing summaries, trends, and aspect insights
- `audit.py`
  records moderation state changes

## End-to-End Workflow

### 1. Review ingestion

`POST /reviews`

The request payload contains:

- `user_id`
- `seller_id`
- `product_id`
- `text`
- `star_rating`
- `media[]`

The service:

- validates the request
- creates the review
- saves media metadata
- sets status to `queued`
- adds a background task to process the review

### 2. Background processing

The internal workflow does the following:

1. Move review to `processing`
2. Run text analysis
3. Run image analysis for image media
4. Run video analysis for video media
5. Compute media score
6. Detect rating-vs-evidence mismatch
7. Load moderation config
8. Apply fusion decision logic
9. Save final decision
10. Update final review status
11. Write audit log

### 3. Seller analytics

The seller portal is supported by:

- `GET /seller/{seller_id}/reviews`
- `GET /seller/{seller_id}/analytics/summary`
- `GET /seller/{seller_id}/analytics/trends`
- `GET /seller/{seller_id}/analytics/aspects`

### 4. Super admin moderation

The super admin can:

- inspect all reviews
- publish a held review
- reject a review
- unpublish a review
- change moderation thresholds and automation settings

Supported endpoints:

- `GET /admin/reviews`
- `POST /admin/reviews/{review_id}/publish`
- `POST /admin/reviews/{review_id}/reject`
- `POST /admin/reviews/{review_id}/unpublish`
- `GET /admin/moderation-config`
- `PATCH /admin/moderation-config`

## Moderation Decision Logic

The current fusion layer applies these rules:

- If the pipeline is disabled:
  send the review to `pending_manual_review`
- If toxicity exceeds threshold:
  mark as `flagged`
- If spam exceeds threshold:
  mark as `rejected`
- If rating conflicts heavily with text/media evidence:
  prefer `pending_manual_review`
- If score meets publish threshold and auto-publish is enabled:
  mark as `published`
- If score lands between manual review and publish thresholds:
  mark as `pending_manual_review`
- If score falls below manual review threshold:
  mark as `rejected`

These values are configurable through the moderation config service.

## API Reference

### Health

- `GET /health`

### Reviews

- `POST /reviews`
- `GET /reviews/{review_id}`
- `GET /products`

### Seller

- `GET /seller/{seller_id}/reviews`
- `GET /seller/{seller_id}/analytics/summary`
- `GET /seller/{seller_id}/analytics/trends`
- `GET /seller/{seller_id}/analytics/aspects`

### Super Admin

- `GET /admin/reviews`
- `POST /admin/reviews/{review_id}/publish`
- `POST /admin/reviews/{review_id}/reject`
- `POST /admin/reviews/{review_id}/unpublish`
- `GET /admin/moderation-config`
- `PATCH /admin/moderation-config`

### Internal

- `POST /internal/process-review/{review_id}`

## Example Review Submission

```json
{
  "user_id": "user-1",
  "seller_id": "seller-1",
  "product_id": "product-1",
  "text": "Great product and fast delivery",
  "star_rating": 5,
  "media": [
    {
      "media_type": "image",
      "media_url": "https://example.com/photo.jpg"
    }
  ]
}
```

## Example Submission Response

```json
{
  "review": {
    "id": "generated-id",
    "user_id": "user-1",
    "seller_id": "seller-1",
    "product_id": "product-1",
    "text": "Great product and fast delivery",
    "star_rating": 5,
    "status": "queued",
    "is_published": false,
    "created_at": "2026-04-09T00:00:00Z",
    "updated_at": "2026-04-09T00:00:00Z",
    "media_ids": ["media-id"]
  },
  "message": "Review accepted and queued for multimodal processing."
}
```

## Example Processed Review Detail

```json
{
  "id": "review-id",
  "status": "published",
  "fusion_decision": {
    "final_score": 0.85,
    "decision": "published",
    "decision_reason": "Review meets auto-publish threshold.",
    "publish_recommendation": true
  },
  "text_analysis": {
    "overall_sentiment": "positive",
    "overall_score": 0.74,
    "spam_score": 0.0,
    "toxicity_score": 0.0
  }
}
```

## Running Locally

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Create env file

Start from:

- [`.env.example`](/c:/Desktop/review/backend/.env.example)

### 3. Run the server

```bash
uvicorn main:app --reload --port 4500
```

Or:

```bash
python main.py
```

## Environment Variables

The backend currently supports:

- `REVIEW_APP_NAME`
- `REVIEW_APP_VERSION`
- `REVIEW_CORS_ORIGINS`
- `REVIEW_MODERATION_AUTO_PUBLISH_ENABLED`
- `REVIEW_MODERATION_PIPELINE_ENABLED`
- `REVIEW_MODERATION_PUBLISH_THRESHOLD`
- `REVIEW_MODERATION_MANUAL_REVIEW_THRESHOLD`
- `REVIEW_MODERATION_TOXICITY_THRESHOLD`
- `REVIEW_MODERATION_SPAM_THRESHOLD`
- `REVIEW_ASTRA_DB_ENABLED`
- `REVIEW_ASTRA_DB_ENDPOINT`
- `REVIEW_ASTRA_DB_TOKEN`

## Important TODOs

- Replace `InMemoryRepository` with PostgreSQL + SQLAlchemy models
- Move background processing to Celery/RQ with Redis or RabbitMQ
- Add media storage abstraction for uploaded files
- Add real OCR, ASR, vision, and LLM-backed moderation clients
- Add auth, RBAC, and tenant isolation for seller access
- Add retry handling, failure queues, and observability
- Add unit and integration tests

## Verification Done

The current backend was verified with:

- import/compile check for `app/`
- FastAPI `TestClient` submission flow
- review processing flow
- seller analytics summary
- moderation config retrieval
