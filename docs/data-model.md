# Data Model

All domain objects are Pydantic `BaseModel`s. They are defined in [backend/app/models/domain.py](../backend/app/models/domain.py) and referenced by enums in [backend/app/models/enums.py](../backend/app/models/enums.py).

## Enums

### `ReviewStatus`
```
submitted, queued, processing, pending_manual_review,
approved, published, rejected, flagged, unpublished, failed
```
`approved` and `failed` are reserved (not produced by the current pipeline).

### `MediaType`
```
image, video
```

### `ActionType` (audit-log discriminator)
```
submitted, queued, processed, published, rejected, flagged,
unpublished, config_updated, manual_override
```

## Aggregate root: `Review`

```python
class Review:
    id: str                       # uuid4
    user_id: str
    seller_id: str
    product_id: str
    title: str
    description: str
    star_rating: int              # 1..5
    status: ReviewStatus = SUBMITTED
    is_published: bool = False
    created_at: datetime          # UTC
    updated_at: datetime          # UTC
    media_ids: list[str] = []
```

`is_published` is a denormalized flag mirroring `status == PUBLISHED`. Both are written together in `update_review_status`.

## `ReviewMedia`

```python
class ReviewMedia:
    id: str                       # uuid4
    review_id: str
    media_type: MediaType
    media_url: str
    thumbnail_url: str | None
    mime_type: str | None
    duration_seconds: float | None
    created_at: datetime
```

## Analysis records

### `ReviewTextAnalysis` — keyed by `review_id`

```python
overall_sentiment: str            # "positive" | "mixed" | "negative"
overall_score: float              # 0..1
spam_score: float                 # 0..1
toxicity_score: float             # 0..1
confidence_score: float           # 0.92 for Qwen, 0.65 for fallback, 0.82 for legacy keyword
aspect_json: list[dict]           # [{aspect, sentiment, score}]
summary: str
```

### `ReviewImageAnalysis` — keyed by `review_media_id`
```python
relevance_score: float
ocr_text: str | None
findings_json: list[dict]
confidence_score: float
```
*Currently never populated by the live pipeline.*

### `ReviewVideoAnalysis` — keyed by `review_media_id`
```python
transcript: str | None
transcript_sentiment: str | None
keyframe_findings_json: list[dict]
ocr_text: str | None
confidence_score: float
```
*Currently never populated by the live pipeline.*

## Fusion output

### `ReviewFusionDecision` — one per `review_id`

```python
review_id: str
final_score: float                # 0..1
decision: ReviewStatus            # one of published / pending_manual_review / rejected / flagged
decision_reason: str              # human-readable explanation
conflict_flags_json: list[dict]   # e.g. [{"type": "rating_mismatch", "delta": 0.62}]
publish_recommendation: bool      # decision == PUBLISHED
analytics_payload: dict           # sentiment, summary, context, base_score, final_score,
                                  # mismatch_detected, mismatch_severity, top_aspects
```

## Configuration

### `ModerationConfig` — one global record

```python
auto_publish_enabled: bool = True
publish_threshold: float = 0.75
manual_review_threshold: float = 0.45
toxicity_threshold: float = 0.8
spam_threshold: float = 0.85
pipeline_enabled: bool = True
updated_at: datetime
```

Stored once (in memory) or as a special document with `_id = "__moderation_config__"` in Astra.

## Audit log

### `ModerationLog`

```python
id: str                           # uuid4
review_id: str
action_by: str                    # "system" or actor name
action_type: ActionType
previous_status: ReviewStatus | None
new_status: ReviewStatus
reason: str
timestamp: datetime
```

There is one log entry per status transition, surfaced through `GET /api/reviews/{id}` as `moderation_logs[]`.

## Persistence shapes

### In-memory ([repositories/memory.py](../backend/app/repositories/memory.py))

```
reviews:           dict[review_id -> Review]
review_media:      dict[media_id -> ReviewMedia]
text_analysis:     dict[review_id -> ReviewTextAnalysis]
image_analysis:    dict[media_id -> list[ReviewImageAnalysis]]
video_analysis:    dict[media_id -> list[ReviewVideoAnalysis]]
fusion_decisions:  dict[review_id -> ReviewFusionDecision]
logs:              dict[review_id -> list[ModerationLog]]
config:            ModerationConfig
```

### Astra DB ([repositories/astra.py](../backend/app/repositories/astra.py))

A single `reviews` collection. Two document shapes:

**Per-review document** (`_id = review.id`, `doc_type = "review"`):
```json
{
  "_id": "uuid",
  "doc_type": "review",
  "review": { ... full Review JSON ... },
  "media": [ ReviewMedia, ... ],
  "text_analysis": ReviewTextAnalysis | null,
  "image_analysis": [ ReviewImageAnalysis, ... ],
  "video_analysis": [ ReviewVideoAnalysis, ... ],
  "fusion_decision": ReviewFusionDecision | null,
  "logs": [ ModerationLog, ... ]
}
```

**Singleton config document** (`_id = "__moderation_config__"`, `doc_type = "moderation_config"`):
```json
{ "_id": "__moderation_config__", "doc_type": "moderation_config", "config": { ... ModerationConfig JSON ... } }
```

This packing means a review-level read is a single `find_one`. The cost is that all media/analysis updates rewrite the whole aggregate.

## Frontend mirror types

The frontend re-models the domain in [frontend/src/app/models/review.model.ts](../frontend/src/app/models/review.model.ts) using camelCase. `ReviewService.mapBackendReview` translates the snake_case backend payload into the frontend `Review`, derives `pipelineStatus` from `fusion_decision.decision` (or `status` as fallback), and rounds the 0..1 scores into 0..100 percentages for display.

| Backend (snake_case)              | Frontend (camelCase)         |
| --------------------------------- | ---------------------------- |
| `id`                              | `id`                         |
| `user_id`                         | `userId`                     |
| `seller_id` / `seller_name`       | `sellerId` / `sellerName`    |
| `star_rating`                     | `starRating`                 |
| `is_published`                    | `isActive`                   |
| `text_analysis.overall_score`     | `sentimentScore` (×100)      |
| `fusion_decision.final_score`     | `pipelineScore` (×100)       |
| `fusion_decision.decision`/`status` → `pipelineStatus` (`approved`/`manual-review`/`blocked`/`pending`) |
