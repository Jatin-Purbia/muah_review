# Claude Agent Prompt File — Python Service Pipeline for Multimodal Review Moderation

You are a senior Python backend architect and AI systems engineer.

Your task is to design and implement a **production-ready multimodal review processing pipeline** for an ecommerce/review platform.

The platform has:

* **Users** who submit reviews
* **Sellers** who can see only their own review analytics
* **Super Admin** who controls moderation and publishing rules

The review system supports these user inputs:

1. **Text message**
2. **Star rating**
3. **Image uploads**
4. **Video uploads**

Your job is to build the **service workflow in Python**.

---

## 1. Business Goal

Build a backend workflow where every review submitted by a user is processed through a multimodal AI pipeline.

The system should:

* analyze review text
* use star rating as a signal
* process images for visible evidence
* process videos for transcript + frame evidence
* combine all signals into a final moderation decision
* support **auto-publish**, **manual review**, or **reject/flag**
* provide structured outputs for a **seller analytics dashboard**
* allow **super admin** to toggle automation on/off

---

## 2. Core Product Behavior

### Review lifecycle

When a user submits a review:

1. Save raw review data and media metadata
2. Send review into processing pipeline
3. Run modality-specific analysis:

   * text analysis
   * rating scoring
   * image analysis
   * video analysis
4. Fuse all outputs into a final decision
5. Decide one of:

   * `published`
   * `pending_manual_review`
   * `rejected`
   * `flagged`
6. Store all intermediate and final outputs
7. Expose processed data for seller dashboard and super admin dashboard

---

## 3. Required Technical Stack

Use Python and design this as a **modular microservice-friendly backend workflow**.

Preferred stack:

* **FastAPI** for APIs
* **Pydantic** for schemas
* **SQLAlchemy** or clean repository abstraction for DB layer
* **Celery / Redis / RabbitMQ** or a clean async job abstraction for background processing
* **PostgreSQL** for relational storage
* **Object storage abstraction** for images/videos
* clean service layer architecture
* typed Python
* clear separation of concerns

If full infra setup is too large, implement the code in a way that is **production-oriented and extensible**, with placeholders where external systems would connect.

---

## 4. AI / ML Pipeline Expectations

Design the workflow assuming these model roles:

### Text pipeline

* aspect extraction
* sentiment analysis
* spam / low-quality detection
* toxicity / abuse flagging
* structured JSON output

### Rating pipeline

* normalize star rating into a score signal
* detect mismatch between rating and text/media evidence

### Image pipeline

* image validation
* OCR extraction if relevant
* relevance detection
* visible issue extraction
* structured findings like damaged packaging / wrong item / broken product / irrelevant image

### Video pipeline

* video validation
* frame extraction
* speech-to-text transcription
* OCR on selected frames if needed
* visual issue extraction from key frames
* structured summary of evidence

### Fusion pipeline

* combine text + rating + image + video evidence
* assign weighted final score
* detect conflicts across modalities
* generate final moderation recommendation
* create seller-facing analytics data

Do **not** hardcode a specific inference provider unless necessary.
Instead, design pluggable interfaces so model backends can be swapped later.

---

## 5. Required Services to Implement

Create a clean architecture with these Python services/modules.

### A. Review Ingestion Service

Responsibilities:

* accept review submission payload
* validate input
* save raw review
* save media metadata
* enqueue processing job

### B. Text Analysis Service

Responsibilities:

* process review text
* return:

  * overall sentiment
  * aspect sentiments
  * spam score
  * toxicity score
  * confidence
  * summary

### C. Rating Analysis Service

Responsibilities:

* convert rating into normalized score
* detect if rating contradicts text/media findings

### D. Image Analysis Service

Responsibilities:

* iterate over uploaded images
* validate and classify relevance
* run OCR if useful
* extract visible issues
* produce structured JSON per image

### E. Video Analysis Service

Responsibilities:

* validate uploaded videos
* extract frames
* transcribe audio
* run OCR on important frames if needed
* extract visible/video evidence
* produce structured JSON per video

### F. Fusion / Moderation Decision Service

Responsibilities:

* combine all outputs
* compute final moderation score
* detect modality conflicts
* decide:

  * publish
  * hold for manual review
  * reject
  * flag
* generate reasoning trace for audit logs

### G. Moderation Config Service

Responsibilities:

* fetch super admin settings
* support:

  * auto_publish_enabled
  * publish_threshold
  * manual_review_threshold
  * toxicity threshold
  * spam threshold
  * toggle for pipeline bypass/manual-only mode

### H. Seller Analytics Service

Responsibilities:

* aggregate processed reviews per seller
* compute metrics for dashboards:

  * review count
  * sentiment split
  * top complaint aspects
  * top praised aspects
  * product-level insights
  * review trends over time

### I. Audit / Moderation Log Service

Responsibilities:

* store moderation decisions
* store manual overrides
* store model outputs and reasoning snapshots

---

## 6. Required Review Statuses

Use clear statuses:

* `submitted`
* `queued`
* `processing`
* `pending_manual_review`
* `approved`
* `published`
* `rejected`
* `flagged`
* `unpublished`
* `failed`

---

## 7. Database / Data Models

Design data models for at least:

### Review

Fields should include:

* id
* user_id
* seller_id
* product_id
* text
* star_rating
* status
* is_published
* created_at
* updated_at

### ReviewMedia

* id
* review_id
* media_type (`image` / `video`)
* media_url
* thumbnail_url
* mime_type
* duration_seconds
* created_at

### ReviewTextAnalysis

* review_id
* overall_sentiment
* overall_score
* spam_score
* toxicity_score
* confidence_score
* aspect_json
* summary

### ReviewImageAnalysis

* review_media_id
* relevance_score
* ocr_text
* findings_json
* confidence_score

### ReviewVideoAnalysis

* review_media_id
* transcript
* transcript_sentiment
* keyframe_findings_json
* ocr_text
* confidence_score

### ReviewFusionDecision

* review_id
* final_score
* decision
* decision_reason
* conflict_flags_json
* publish_recommendation

### ModerationConfig

* auto_publish_enabled
* publish_threshold
* manual_review_threshold
* toxicity_threshold
* spam_threshold
* pipeline_enabled

### ModerationLog

* review_id
* action_by
* action_type
* previous_status
* new_status
* reason
* timestamp

Design the schema cleanly and realistically.

---

## 8. API Endpoints to Design

Implement or scaffold these APIs:

### Review submission

* `POST /reviews`

### Review detail

* `GET /reviews/{review_id}`

### Seller dashboard

* `GET /seller/{seller_id}/reviews`
* `GET /seller/{seller_id}/analytics/summary`
* `GET /seller/{seller_id}/analytics/trends`
* `GET /seller/{seller_id}/analytics/aspects`

### Super admin moderation

* `GET /admin/reviews`
* `POST /admin/reviews/{review_id}/publish`
* `POST /admin/reviews/{review_id}/reject`
* `POST /admin/reviews/{review_id}/unpublish`
* `PATCH /admin/moderation-config`
* `GET /admin/moderation-config`

### Internal processing hooks

* `POST /internal/process-review/{review_id}`

---

## 9. Workflow Expectations

Implement the service workflow in a way that supports both:

### Synchronous lightweight path

At submission time:

* validate request
* save records
* enqueue jobs
* return immediate response quickly

### Asynchronous heavy path

In background:

* run text analysis
* run image analysis
* run video analysis
* run fusion decision
* update review state
* store analytics data

---

## 10. Moderation Decision Rules

Implement clear decision logic.

Example logic:

* If pipeline is disabled → send to manual review
* If toxicity score above threshold → flag
* If spam score above threshold → reject or manual review depending on config
* If final score >= publish threshold and no severe conflict → publish
* If final score is between manual threshold and publish threshold → pending manual review
* If final score < manual threshold → reject
* If media/text mismatch is severe → pending manual review

Make these rules configurable and easy to maintain.

---

## 11. Architecture Requirements

The code should be:

* modular
* typed
* maintainable
* cleanly layered
* easy to extend later
* suitable for production workflows

Prefer structure like:

```text
app/
  api/
  core/
  models/
  schemas/
  services/
  repositories/
  workers/
  pipelines/
  utils/
  tests/
```

---

## 12. Output Format You Must Produce

I want you to generate the implementation in a structured way.

### First provide:

1. Project folder structure
2. Architecture explanation
3. End-to-end workflow explanation

### Then provide code for:

* schemas
* models
* services
* repositories
* API routes
* worker/job flow
* moderation logic
* sample config
* sample environment variables

### Also include:

* example request/response payloads
* sample JSON output of the multimodal analysis
* comments in code where actual model inference should be plugged in
* clear TODO markers for production integrations

---

## 13. Important Constraints

* Do not build a toy demo only
* Do not collapse everything into one file
* Do not skip schemas and status models
* Do not skip async processing design
* Do not skip seller analytics aggregation
* Do not skip super admin moderation control
* Do not tightly couple code to one model vendor
* Keep model clients abstracted behind service interfaces
* Use realistic naming and maintainable patterns

---

## 14. Nice-to-Have Features

If possible, also include:

* duplicate media detection hooks
* review authenticity scoring hook
* retry strategy for failed jobs
* dead-letter / failure handling concept
* health check endpoint
* observability/logging placeholders
* unit test examples for moderation logic

---

## 15. Final Goal

Produce a **clean Python backend workflow** for a multimodal review moderation and analytics system that can realistically be used as the base for implementation in production.

The system must support:

* users submitting text, star ratings, images, and videos
* super admin moderation control
* seller-specific review analytics
* auto-publish or manual moderation logic
* structured and extensible AI pipeline orchestration

Now generate the complete architecture and code workflow accordingly.
