from collections import defaultdict

from app.models.enums import ReviewStatus
from app.repositories.base import ReviewRepository
from app.schemas.analytics import SellerAnalyticsSummary, SellerAspectInsight, SellerReviewInsight, SellerTrendPoint


class SellerAnalyticsService:
    def __init__(self, repo: ReviewRepository) -> None:
        self.repo = repo

    @staticmethod
    def _customer_tone(overall_sentiment: str | None, star_rating: int) -> str:
        if overall_sentiment in {"positive", "mixed", "negative"}:
            return overall_sentiment
        if star_rating >= 4:
            return "positive"
        if star_rating <= 2:
            return "negative"
        return "neutral"

    @staticmethod
    def _main_theme(aspect_json: list[dict]) -> str | None:
        if not aspect_json:
            return None
        top_aspect = max(aspect_json, key=lambda item: float(item.get("score", 0.0)))
        return str(top_aspect.get("aspect", "")).replace("_", " ").strip() or None

    @staticmethod
    def _seller_action(review_status: ReviewStatus, is_published: bool) -> str:
        if is_published or review_status == ReviewStatus.PUBLISHED:
            return "Live on store"
        if review_status == ReviewStatus.PENDING_MANUAL_REVIEW:
            return "Waiting for admin review"
        if review_status == ReviewStatus.FLAGGED:
            return "Blocked for safety review"
        if review_status == ReviewStatus.REJECTED:
            return "Rejected by moderation"
        if review_status == ReviewStatus.FAILED:
            return "Processing failed"
        if review_status == ReviewStatus.PROCESSING:
            return "Processing now"
        return "Not live"

    def list_reviews(self, seller_id: str, products: dict[str, dict] | None = None) -> list[dict]:
        reviews = [review for review in self.repo.list_reviews() if review.seller_id == seller_id]
        result: list[dict] = []
        for review in reviews:
            analysis = self.repo.get_text_analysis(review.id)
            product = (products or {}).get(review.product_id, {})
            insight = SellerReviewInsight(
                review_id=review.id,
                title=review.title,
                description=review.description,
                category=review.category.value,
                product_id=review.product_id,
                product_name=product.get("name", review.product_id),
                seller_id=review.seller_id,
                seller_name=product.get("seller_name", review.seller_id),
                star_rating=review.star_rating,
                status=review.status.value,
                is_published=review.is_published,
                created_at=review.created_at,
                updated_at=review.updated_at,
                customer_tone=self._customer_tone(analysis.overall_sentiment if analysis else None, review.star_rating),
                analysis_mode=analysis.analysis_mode if analysis else None,
                analysis_summary=analysis.summary if analysis else None,
                main_theme=self._main_theme(analysis.aspect_json if analysis else []),
                seller_action=self._seller_action(review.status, review.is_published),
                aspect_json=analysis.aspect_json if analysis else [],
            )
            result.append(insight.model_dump(mode="json"))
        return result

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
