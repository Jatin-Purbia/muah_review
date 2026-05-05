from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from astrapy import DataAPIClient

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


class AstraRepository:
    REVIEWS_COLLECTION = "reviews"
    CONFIG_DOC_ID = "__moderation_config__"

    def __init__(self, config: ModerationConfig, api_endpoint: str, token: str) -> None:
        self.config = config
        self.client = DataAPIClient()
        self.database = self.client.get_database(api_endpoint, token=token)
        self._ensure_collections()
        self.reviews = self.database.get_collection(self.REVIEWS_COLLECTION)
        self._ensure_config_document()

    def _ensure_collections(self) -> None:
        collection_names = set(self.database.list_collection_names())
        if self.REVIEWS_COLLECTION not in collection_names:
            self.database.create_collection(self.REVIEWS_COLLECTION)

    def _ensure_config_document(self) -> None:
        if not self.reviews.find_one({"_id": self.CONFIG_DOC_ID}):
            self._save_config_document(self.config)

    def _save_config_document(self, config: ModerationConfig) -> None:
        document = {
            "_id": self.CONFIG_DOC_ID,
            "doc_type": "moderation_config",
            "config": config.model_dump(mode="json"),
        }
        self.reviews.replace_one({"_id": self.CONFIG_DOC_ID}, document, upsert=True)

    def _utc_now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _empty_review_document(self, review: Review) -> dict[str, Any]:
        return {
            "_id": review.id,
            "doc_type": "review",
            "review": review.model_dump(mode="json"),
            "media": [],
            "text_analysis": None,
            "image_analysis": [],
            "video_analysis": [],
            "fusion_decision": None,
            "logs": [],
        }

    def _get_review_document(self, review_id: str) -> dict[str, Any] | None:
        return self.reviews.find_one({"_id": review_id})

    def _save_review_document(self, document: dict[str, Any]) -> None:
        self.reviews.replace_one({"_id": document["_id"]}, document, upsert=True)

    def _get_or_create_review_document(self, review: Review) -> dict[str, Any]:
        document = self._get_review_document(review.id)
        if not document:
            document = self._empty_review_document(review)
        return document

    def _hydrate_review(self, document: dict[str, Any]) -> Review:
        review_data = document["review"]
        # Ensure category field exists for backward compatibility with old documents
        if "category" not in review_data:
            from app.models.enums import ReviewCategory
            review_data["category"] = ReviewCategory.PRODUCTS.value
        return Review.model_validate(review_data)

    def save_review(self, review: Review) -> Review:
        document = self._get_or_create_review_document(review)
        document["doc_type"] = "review"
        # Ensure category is always saved
        review_data = review.model_dump(mode="json")
        if "category" not in review_data or not review_data["category"]:
            from app.models.enums import ReviewCategory
            review_data["category"] = ReviewCategory.PRODUCTS.value
        document["review"] = review_data
        self._save_review_document(document)
        return review

    def list_reviews(self) -> list[Review]:
        return [
            review
            for document in self.reviews.find({"doc_type": "review"})
            if not (review := self._hydrate_review(document)).is_deleted
        ]

    def get_review(self, review_id: str) -> Review | None:
        document = self._get_review_document(review_id)
        if not document:
            return None
        return self._hydrate_review(document)

    def delete_review(self, review_id: str) -> bool:
        document = self._get_review_document(review_id)
        if not document:
            return False

        review = self._hydrate_review(document)
        review.is_deleted = True
        review.is_published = False
        review.updated_at = datetime.now(timezone.utc)
        document["review"] = review.model_dump(mode="json")
        self._save_review_document(document)
        return True

    def update_review_status(self, review_id: str, status: ReviewStatus, *, is_published: bool | None = None) -> Review:
        document = self._get_review_document(review_id)
        if not document:
            raise KeyError(f"Review {review_id} not found")

        review = Review.model_validate(document["review"])
        review.status = status
        if is_published is not None:
            review.is_published = is_published
        review.updated_at = datetime.now(timezone.utc)
        document["review"] = review.model_dump(mode="json")
        self._save_review_document(document)
        return review

    def save_media(self, media: ReviewMedia) -> ReviewMedia:
        review = self.get_review(media.review_id)
        if not review:
            raise KeyError(f"Review {media.review_id} not found")

        document = self._get_or_create_review_document(review)
        media_items = [item for item in document.get("media", []) if item.get("id") != media.id]
        media_items.append(media.model_dump(mode="json"))
        document["media"] = media_items
        self._save_review_document(document)
        return media

    def get_review_media(self, review_id: str) -> list[ReviewMedia]:
        document = self._get_review_document(review_id)
        if not document:
            return []
        return [ReviewMedia.model_validate(item) for item in document.get("media", [])]

    def save_text_analysis(self, analysis: ReviewTextAnalysis) -> ReviewTextAnalysis:
        review = self.get_review(analysis.review_id)
        if not review:
            raise KeyError(f"Review {analysis.review_id} not found")

        document = self._get_or_create_review_document(review)
        document["text_analysis"] = analysis.model_dump(mode="json")
        self._save_review_document(document)
        return analysis

    def get_text_analysis(self, review_id: str) -> ReviewTextAnalysis | None:
        document = self._get_review_document(review_id)
        if not document or not document.get("text_analysis"):
            return None
        return ReviewTextAnalysis.model_validate(document["text_analysis"])

    def save_image_analysis(self, analysis: ReviewImageAnalysis) -> ReviewImageAnalysis:
        media = next((item for item in self.reviews.find({"doc_type": "review"}) if any(m.get("id") == analysis.review_media_id for m in item.get("media", []))), None)
        if not media:
            raise KeyError(f"Media {analysis.review_media_id} not found")

        entries = list(media.get("image_analysis", []))
        entries.append(analysis.model_dump(mode="json"))
        media["image_analysis"] = entries
        self._save_review_document(media)
        return analysis

    def get_image_analysis_for_review(self, review_id: str) -> list[ReviewImageAnalysis]:
        document = self._get_review_document(review_id)
        if not document:
            return []
        return [ReviewImageAnalysis.model_validate(item) for item in document.get("image_analysis", [])]

    def save_video_analysis(self, analysis: ReviewVideoAnalysis) -> ReviewVideoAnalysis:
        media = next((item for item in self.reviews.find({"doc_type": "review"}) if any(m.get("id") == analysis.review_media_id for m in item.get("media", []))), None)
        if not media:
            raise KeyError(f"Media {analysis.review_media_id} not found")

        entries = list(media.get("video_analysis", []))
        entries.append(analysis.model_dump(mode="json"))
        media["video_analysis"] = entries
        self._save_review_document(media)
        return analysis

    def get_video_analysis_for_review(self, review_id: str) -> list[ReviewVideoAnalysis]:
        document = self._get_review_document(review_id)
        if not document:
            return []
        return [ReviewVideoAnalysis.model_validate(item) for item in document.get("video_analysis", [])]

    def save_fusion_decision(self, decision: ReviewFusionDecision) -> ReviewFusionDecision:
        review = self.get_review(decision.review_id)
        if not review:
            raise KeyError(f"Review {decision.review_id} not found")

        document = self._get_or_create_review_document(review)
        document["fusion_decision"] = decision.model_dump(mode="json")
        self._save_review_document(document)
        return decision

    def get_fusion_decision(self, review_id: str) -> ReviewFusionDecision | None:
        document = self._get_review_document(review_id)
        if not document or not document.get("fusion_decision"):
            return None
        return ReviewFusionDecision.model_validate(document["fusion_decision"])

    def save_log(self, log: ModerationLog) -> ModerationLog:
        review = self.get_review(log.review_id)
        if not review:
            raise KeyError(f"Review {log.review_id} not found")

        document = self._get_or_create_review_document(review)
        entries = [item for item in document.get("logs", []) if item.get("id") != log.id]
        entries.append(log.model_dump(mode="json"))
        document["logs"] = entries
        self._save_review_document(document)
        return log

    def get_logs(self, review_id: str) -> list[ModerationLog]:
        document = self._get_review_document(review_id)
        if not document:
            return []
        return [ModerationLog.model_validate(item) for item in document.get("logs", [])]

    def get_config(self) -> ModerationConfig:
        document = self.reviews.find_one({"_id": self.CONFIG_DOC_ID})
        if not document:
            self._save_config_document(self.config)
            return self.config
        self.config = ModerationConfig.model_validate(document["config"])
        return self.config

    def update_config(self, config: ModerationConfig) -> ModerationConfig:
        self.config = config
        self._save_config_document(config)
        return config
