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
