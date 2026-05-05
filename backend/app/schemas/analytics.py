from datetime import datetime

from pydantic import BaseModel


class SellerAnalyticsSummary(BaseModel):
    seller_id: str
    total_reviews: int
    published_reviews: int
    pending_reviews: int
    flagged_reviews: int
    rejected_reviews: int
    avg_rating: float
    sentiment_split: dict[str, int]


class SellerTrendPoint(BaseModel):
    date_label: str
    avg_rating: float
    reviews: int


class SellerAspectInsight(BaseModel):
    aspect: str
    positive_mentions: int
    negative_mentions: int
    neutral_mentions: int


class SellerReviewInsight(BaseModel):
    review_id: str
    title: str
    description: str
    category: str
    product_id: str
    product_name: str
    seller_id: str
    seller_name: str
    star_rating: int
    status: str
    is_published: bool
    created_at: datetime
    updated_at: datetime
    customer_tone: str
    analysis_mode: str | None = None
    analysis_summary: str | None = None
    main_theme: str | None = None
    seller_action: str
    aspect_json: list[dict] = []
