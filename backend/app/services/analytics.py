from collections import defaultdict

from app.models.enums import ReviewStatus
from app.repositories.memory import InMemoryRepository
from app.schemas.analytics import SellerAnalyticsSummary, SellerAspectInsight, SellerTrendPoint


class SellerAnalyticsService:
    def __init__(self, repo: InMemoryRepository) -> None:
        self.repo = repo

    def list_reviews(self, seller_id: str) -> list[dict]:
        reviews = [review for review in self.repo.list_reviews() if review.seller_id == seller_id]
        return [review.model_dump() for review in reviews]

    def summary(self, seller_id: str) -> SellerAnalyticsSummary:
        reviews = [review for review in self.repo.list_reviews() if review.seller_id == seller_id]
        total_reviews = len(reviews)
        published_reviews = sum(1 for review in reviews if review.is_published)
        pending_reviews = sum(1 for review in reviews if review.status == ReviewStatus.PENDING_MANUAL_REVIEW)
        flagged_reviews = sum(1 for review in reviews if review.status == ReviewStatus.FLAGGED)
        rejected_reviews = sum(1 for review in reviews if review.status == ReviewStatus.REJECTED)
        avg_rating = round(sum(review.star_rating for review in reviews) / total_reviews, 2) if total_reviews else 0.0
        sentiment_split = {"positive": 0, "mixed": 0, "negative": 0}
        for review in reviews:
            analysis = self.repo.get_text_analysis(review.id)
            if analysis:
                sentiment_split[analysis.overall_sentiment] = sentiment_split.get(analysis.overall_sentiment, 0) + 1
        return SellerAnalyticsSummary(
            seller_id=seller_id,
            total_reviews=total_reviews,
            published_reviews=published_reviews,
            pending_reviews=pending_reviews,
            flagged_reviews=flagged_reviews,
            rejected_reviews=rejected_reviews,
            avg_rating=avg_rating,
            sentiment_split=sentiment_split,
        )

    def trends(self, seller_id: str) -> list[SellerTrendPoint]:
        buckets: dict[str, list[int]] = defaultdict(list)
        for review in self.repo.list_reviews():
            if review.seller_id != seller_id:
                continue
            label = review.created_at.strftime("%Y-%m")
            buckets[label].append(review.star_rating)
        return [
            SellerTrendPoint(date_label=label, avg_rating=round(sum(ratings) / len(ratings), 2), reviews=len(ratings))
            for label, ratings in sorted(buckets.items())
        ]

    def aspects(self, seller_id: str) -> list[SellerAspectInsight]:
        counters: dict[str, dict[str, int]] = defaultdict(lambda: {"positive": 0, "negative": 0, "neutral": 0})
        for review in self.repo.list_reviews():
            if review.seller_id != seller_id:
                continue
            analysis = self.repo.get_text_analysis(review.id)
            if not analysis:
                continue
            for aspect in analysis.aspect_json:
                name = aspect["aspect"]
                sentiment = aspect["sentiment"] if aspect["sentiment"] in counters[name] else "neutral"
                counters[name][sentiment] += 1
        return [
            SellerAspectInsight(
                aspect=aspect,
                positive_mentions=counts["positive"],
                negative_mentions=counts["negative"],
                neutral_mentions=counts["neutral"],
            )
            for aspect, counts in sorted(counters.items())
        ]
