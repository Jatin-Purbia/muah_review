# API Reference

Base URL: `http://localhost:4500/api`

All endpoints accept and return `application/json`. Error responses use FastAPI's default `{"detail": "..."}` shape with a 4xx/5xx status code.

The router is defined in [backend/app/api/routes.py](../backend/app/api/routes.py). Below is every endpoint grouped by audience.

---

## Health

### `GET /health`

```json
{ "status": "ok" }
```

---

## Reviews (user-facing)

### `POST /reviews` — submit a review

Request body — `ReviewCreateRequest`:

```json
{
  "user_id": "user-1",
  "seller_id": "seller-1",
  "product_id": "prod-1",
  "title": "Great product",
  "description": "Fast delivery and quality is excellent",
  "star_rating": 5,
  "media": [
    {
      "media_type": "image",
      "media_url": "https://example.com/photo.jpg",
      "thumbnail_url": null,
      "mime_type": "image/jpeg",
      "duration_seconds": null
    }
  ]
}
```

Constraints:
- `title`, `description`: `min_length=1`.
- `star_rating`: integer in `[1, 5]`.
- `media[].media_type`: `"image"` or `"video"`.

Response — `201 Created`:

```json
{
  "review": {
    "id": "uuid",
    "user_id": "user-1",
    "seller_id": "seller-1",
    "product_id": "prod-1",
    "title": "Great product",
    "description": "Fast delivery and quality is excellent",
    "star_rating": 5,
    "status": "queued",
    "is_published": false,
    "created_at": "2026-04-27T12:00:00Z",
    "updated_at": "2026-04-27T12:00:00Z",
    "media_ids": ["uuid"]
  },
  "message": "Review accepted and queued for multimodal processing."
}
```

The pipeline runs asynchronously after the response is sent.

### `GET /reviews/{review_id}`

Returns the full `ReviewDetailResponse` — review + analyses + fusion decision + moderation logs + product/seller name resolution.

```json
{
  "id": "uuid",
  "user_id": "user-1",
  "seller_id": "seller-1",
  "product_id": "prod-1",
  "product_name": "Resolved product name",
  "seller_name": "Resolved brand name",
  "title": "...",
  "description": "...",
  "star_rating": 5,
  "status": "published",
  "is_published": true,
  "created_at": "...",
  "updated_at": "...",
  "media_ids": [...],
  "text_analysis": {
    "review_id": "uuid",
    "overall_sentiment": "positive",
    "overall_score": 0.85,
    "spam_score": 0.0,
    "toxicity_score": 0.0,
    "confidence_score": 0.92,
    "aspect_json": [
      { "aspect": "product_quality", "sentiment": "positive", "score": 0.9 }
    ],
    "summary": "Customer is satisfied..."
  },
  "image_analysis": [],
  "video_analysis": [],
  "fusion_decision": {
    "review_id": "uuid",
    "final_score": 0.83,
    "decision": "published",
    "decision_reason": "Review meets auto-publish threshold...",
    "conflict_flags_json": [],
    "publish_recommendation": true,
    "analytics_payload": { "sentiment": "positive", "summary": "...", "...": "..." }
  },
  "moderation_logs": [
    { "review_id": "...", "action_by": "system", "action_type": "submitted", "...": "..." }
  ]
}
```

### `GET /products`

Returns the catalog produced by `ProductCatalogService` from [products.json](../products.json):

```json
[
  {
    "id": "prod-1",
    "name": "Product name",
    "description": "...",
    "seller_id": "uuid-or-slug",
    "seller_name": "Brand Name",
    "brand_id": "uuid",
    "price": 1299,
    "image_url": "https://...",
    "review_count": 12,
    "review_avg": 4.3
  }
]
```

---

## Seller portal

`{seller_id}` must match the `seller_id` carried on submitted reviews — usually a brand slug or decoded UUID coming from `GET /products`.

### `GET /seller/{seller_id}/reviews`

Returns all reviews authored against this seller, in `Review` shape (no analysis bundle).

### `GET /seller/{seller_id}/analytics/summary`

```json
{
  "seller_id": "...",
  "total_reviews": 12,
  "published_reviews": 9,
  "pending_reviews": 2,
  "flagged_reviews": 0,
  "rejected_reviews": 1,
  "avg_rating": 4.3,
  "sentiment_split": { "positive": 8, "mixed": 3, "negative": 1 }
}
```

### `GET /seller/{seller_id}/analytics/trends`

Monthly bucketed trend points:

```json
[
  { "date_label": "2026-03", "avg_rating": 4.5, "reviews": 6 },
  { "date_label": "2026-04", "avg_rating": 4.1, "reviews": 6 }
]
```

### `GET /seller/{seller_id}/analytics/aspects`

Aggregated aspect mentions across the seller's reviews:

```json
[
  {
    "aspect": "product_quality",
    "positive_mentions": 7,
    "negative_mentions": 1,
    "neutral_mentions": 4
  }
]
```

---

## Super admin

All admin endpoints currently lack auth — see [backend/README.md](../backend/README.md) TODOs.

### `GET /admin/reviews`

Lists every review in the system enriched with `text_analysis`, `fusion_decision`, `product_name`, and `seller_name`. The frontend dashboard uses this as its primary read.

### `POST /admin/reviews/{review_id}/publish`
### `POST /admin/reviews/{review_id}/reject`
### `POST /admin/reviews/{review_id}/unpublish`
### `DELETE /admin/reviews/{review_id}`

All four take the same `ManualModerationRequest` body:

```json
{ "reason": "Spot-checked and approved", "actor": "super-admin" }
```

`reason` is required and `min_length=1`. `actor` defaults to `"super-admin"` when omitted.

| Endpoint | Resulting status | `is_published` |
| --- | --- | --- |
| `/publish` | `published` | `true` |
| `/reject` | `rejected` | `false` |
| `/unpublish` | `unpublished` | `false` |
| `DELETE` | row deleted | n/a, returns `{"review_id":..., "deleted": true, "actor": ...}` |

Each operation emits an audit log entry with `action_type=MANUAL_OVERRIDE` (delete is a hard delete and does not log).

### `GET /admin/moderation-config`

Returns the active `ModerationConfig`:

```json
{
  "auto_publish_enabled": true,
  "publish_threshold": 0.75,
  "manual_review_threshold": 0.45,
  "toxicity_threshold": 0.8,
  "spam_threshold": 0.85,
  "pipeline_enabled": true,
  "updated_at": "2026-04-27T12:00:00Z"
}
```

### `PATCH /admin/moderation-config`

Partial update via `ModerationConfigPatchRequest`. Send only the fields you want to change; thresholds are clamped to `[0, 1]`.

```json
{ "publish_threshold": 0.8, "auto_publish_enabled": false }
```

Returns the new full config.

---

## Internal

### `POST /internal/process-review/{review_id}`

Manually triggers the moderation pipeline for an existing review. Useful for re-running after Ollama was offline. Returns:

```json
{ "status": "processed", "review_id": "uuid" }
```

This is the same code path that `BackgroundTask` invokes after submission.

---

## Common error cases

| Status | When | Body |
| --- | --- | --- |
| `404` | Unknown `review_id` | `{ "detail": "Review not found" }` |
| `422` | Pydantic validation failure on body | FastAPI default validation error array |
| `500` | Ollama unreachable AND fallback also raised, or repo failure | `{ "detail": "..." }` |
