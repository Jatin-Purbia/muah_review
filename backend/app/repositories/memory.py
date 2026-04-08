from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from app.models.domain import (
    ModerationConfig,
    ModerationLog,
    Review,
    ReviewFusionDecision,
    ReviewImageAnalysis,
    ReviewMedia,
    ReviewTextAnalysis,
    ReviewVideoAnalysis,
)
from app.models.enums import ReviewStatus


class InMemoryRepository:
    def __init__(self, config: ModerationConfig) -> None:
        self.reviews: dict[str, Review] = {}
        self.review_media: dict[str, ReviewMedia] = {}
        self.text_analysis: dict[str, ReviewTextAnalysis] = {}
        self.image_analysis: dict[str, list[ReviewImageAnalysis]] = defaultdict(list)
        self.video_analysis: dict[str, list[ReviewVideoAnalysis]] = defaultdict(list)
        self.fusion_decisions: dict[str, ReviewFusionDecision] = {}
        self.logs: dict[str, list[ModerationLog]] = defaultdict(list)
        self.config = config

    def save_review(self, review: Review) -> Review:
        self.reviews[review.id] = review
        return review

    def list_reviews(self) -> list[Review]:
        return list(self.reviews.values())

    def get_review(self, review_id: str) -> Review | None:
        return self.reviews.get(review_id)

    def update_review_status(self, review_id: str, status: ReviewStatus, *, is_published: bool | None = None) -> Review:
        review = self.reviews[review_id]
        review.status = status
        if is_published is not None:
            review.is_published = is_published
        review.updated_at = datetime.now(timezone.utc)
        self.reviews[review_id] = review
        return review

    def save_media(self, media: ReviewMedia) -> ReviewMedia:
        self.review_media[media.id] = media
        return media

    def get_review_media(self, review_id: str) -> list[ReviewMedia]:
        return [media for media in self.review_media.values() if media.review_id == review_id]

    def save_text_analysis(self, analysis: ReviewTextAnalysis) -> ReviewTextAnalysis:
        self.text_analysis[analysis.review_id] = analysis
        return analysis

    def get_text_analysis(self, review_id: str) -> ReviewTextAnalysis | None:
        return self.text_analysis.get(review_id)

    def save_image_analysis(self, analysis: ReviewImageAnalysis) -> ReviewImageAnalysis:
        self.image_analysis[analysis.review_media_id].append(analysis)
        return analysis

    def get_image_analysis_for_review(self, review_id: str) -> list[ReviewImageAnalysis]:
        media_ids = {media.id for media in self.get_review_media(review_id)}
        result: list[ReviewImageAnalysis] = []
        for media_id in media_ids:
            result.extend(self.image_analysis.get(media_id, []))
        return result

    def save_video_analysis(self, analysis: ReviewVideoAnalysis) -> ReviewVideoAnalysis:
        self.video_analysis[analysis.review_media_id].append(analysis)
        return analysis

    def get_video_analysis_for_review(self, review_id: str) -> list[ReviewVideoAnalysis]:
        media_ids = {media.id for media in self.get_review_media(review_id)}
        result: list[ReviewVideoAnalysis] = []
        for media_id in media_ids:
            result.extend(self.video_analysis.get(media_id, []))
        return result

    def save_fusion_decision(self, decision: ReviewFusionDecision) -> ReviewFusionDecision:
        self.fusion_decisions[decision.review_id] = decision
        return decision

    def get_fusion_decision(self, review_id: str) -> ReviewFusionDecision | None:
        return self.fusion_decisions.get(review_id)

    def save_log(self, log: ModerationLog) -> ModerationLog:
        self.logs[log.review_id].append(log)
        return log

    def get_logs(self, review_id: str) -> list[ModerationLog]:
        return self.logs.get(review_id, [])

    def get_config(self) -> ModerationConfig:
        return self.config

    def update_config(self, config: ModerationConfig) -> ModerationConfig:
        self.config = config
        return self.config
