from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import MediaType, ReviewStatus


class ReviewMediaIn(BaseModel):
    media_type: MediaType
    media_url: str
    thumbnail_url: str | None = None
    mime_type: str | None = None
    duration_seconds: float | None = None


class ReviewCreateRequest(BaseModel):
    user_id: str
    seller_id: str
    product_id: str
    text: str = Field(min_length=1)
    star_rating: int = Field(ge=1, le=5)
    media: list[ReviewMediaIn] = Field(default_factory=list)


class ReviewResponse(BaseModel):
    id: str
    user_id: str
    seller_id: str
    product_id: str
    text: str
    star_rating: int
    status: ReviewStatus
    is_published: bool
    created_at: datetime
    updated_at: datetime
    media_ids: list[str]


class ReviewDetailResponse(ReviewResponse):
    text_analysis: dict | None = None
    image_analysis: list[dict] = Field(default_factory=list)
    video_analysis: list[dict] = Field(default_factory=list)
    fusion_decision: dict | None = None
    moderation_logs: list[dict] = Field(default_factory=list)
