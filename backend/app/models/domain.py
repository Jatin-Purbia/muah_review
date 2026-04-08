from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import ActionType, MediaType, ReviewStatus


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReviewMedia(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    review_id: str
    media_type: MediaType
    media_url: str
    thumbnail_url: str | None = None
    mime_type: str | None = None
    duration_seconds: float | None = None
    created_at: datetime = Field(default_factory=utc_now)


class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    seller_id: str
    product_id: str
    text: str
    star_rating: int
    status: ReviewStatus = ReviewStatus.SUBMITTED
    is_published: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    media_ids: list[str] = Field(default_factory=list)


class ReviewTextAnalysis(BaseModel):
    review_id: str
    overall_sentiment: str
    overall_score: float
    spam_score: float
    toxicity_score: float
    confidence_score: float
    aspect_json: list[dict[str, Any]]
    summary: str


class ReviewImageAnalysis(BaseModel):
    review_media_id: str
    relevance_score: float
    ocr_text: str | None = None
    findings_json: list[dict[str, Any]] = Field(default_factory=list)
    confidence_score: float


class ReviewVideoAnalysis(BaseModel):
    review_media_id: str
    transcript: str | None = None
    transcript_sentiment: str | None = None
    keyframe_findings_json: list[dict[str, Any]] = Field(default_factory=list)
    ocr_text: str | None = None
    confidence_score: float


class ReviewFusionDecision(BaseModel):
    review_id: str
    final_score: float
    decision: ReviewStatus
    decision_reason: str
    conflict_flags_json: list[dict[str, Any]] = Field(default_factory=list)
    publish_recommendation: bool
    analytics_payload: dict[str, Any] = Field(default_factory=dict)


class ModerationConfig(BaseModel):
    auto_publish_enabled: bool = True
    publish_threshold: float = 0.75
    manual_review_threshold: float = 0.45
    toxicity_threshold: float = 0.8
    spam_threshold: float = 0.85
    pipeline_enabled: bool = True
    updated_at: datetime = Field(default_factory=utc_now)


class ModerationLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    review_id: str
    action_by: str
    action_type: ActionType
    previous_status: ReviewStatus | None = None
    new_status: ReviewStatus
    reason: str
    timestamp: datetime = Field(default_factory=utc_now)
