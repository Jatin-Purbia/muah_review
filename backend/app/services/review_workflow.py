from fastapi import BackgroundTasks, HTTPException

from app.models.domain import Review, ReviewMedia
from app.models.enums import ActionType, MediaType, ReviewStatus
from app.repositories.memory import InMemoryRepository
from app.schemas.admin import ManualModerationRequest
from app.schemas.review import ReviewCreateRequest
from app.services.analysis import (
    RatingAnalysisService,
    TextAnalysisService,
)
from app.services.audit import AuditLogService
from app.services.fusion import FusionModerationService
from app.services.moderation_config import ModerationConfigService


class ReviewWorkflowService:
    def __init__(
        self,
        repo: InMemoryRepository,
        config_service: ModerationConfigService,
        audit_service: AuditLogService,
        text_service: TextAnalysisService,
        rating_service: RatingAnalysisService,
        fusion_service: FusionModerationService,
    ) -> None:
        self.repo = repo
        self.config_service = config_service
        self.audit_service = audit_service
        self.text_service = text_service
        self.rating_service = rating_service
        self.fusion_service = fusion_service

    def submit_review(self, payload: ReviewCreateRequest, background_tasks: BackgroundTasks) -> Review:
        review = Review(
            user_id=payload.user_id,
            seller_id=payload.seller_id,
            product_id=payload.product_id,
            title=payload.title,
            description=payload.description,
            star_rating=payload.star_rating,
            status=ReviewStatus.QUEUED,
        )
        self.repo.save_review(review)

        media_ids: list[str] = []
        for item in payload.media:
            media = ReviewMedia(
                review_id=review.id,
                media_type=item.media_type,
                media_url=item.media_url,
                thumbnail_url=item.thumbnail_url,
                mime_type=item.mime_type,
                duration_seconds=item.duration_seconds,
            )
            self.repo.save_media(media)
            media_ids.append(media.id)

        review.media_ids = media_ids
        self.repo.save_review(review)
        self.audit_service.log(
            review.id,
            action_by=payload.user_id,
            action_type=ActionType.SUBMITTED,
            previous_status=ReviewStatus.SUBMITTED,
            new_status=ReviewStatus.QUEUED,
            reason="Review accepted and queued for multimodal processing.",
        )
        background_tasks.add_task(self.process_review, review.id)
        return review

    def process_review(self, review_id: str) -> None:
        review = self.repo.get_review(review_id)
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        previous_status = review.status
        review = self.repo.update_review_status(review_id, ReviewStatus.PROCESSING, is_published=False)
        self.audit_service.log(
            review_id,
            action_by="system",
            action_type=ActionType.QUEUED,
            previous_status=previous_status,
            new_status=ReviewStatus.PROCESSING,
            reason="Processing job started.",
        )

        text_analysis = self.text_service.analyze(review)
        self.repo.save_text_analysis(text_analysis)

        # Media is stored but not analyzed for content/relevance
        # Media score is neutral - just indicates media presence
        media_items = self.repo.get_review_media(review_id)
        media_score = 0.6 if media_items else 0.5

        rating_signal = self.rating_service.detect_mismatch(review.star_rating, text_analysis.overall_score, media_score)
        config = self.config_service.get()
        decision = self.fusion_service.decide(
            review_id=review_id,
            config=config,
            text_analysis=text_analysis,
            rating_signal=rating_signal,
            media_score=media_score,
            image_findings=[],
            video_findings=[],
        )
        self.repo.save_fusion_decision(decision)

        is_published = decision.decision == ReviewStatus.PUBLISHED
        self.repo.update_review_status(review_id, decision.decision, is_published=is_published)
        self.audit_service.log(
            review_id,
            action_by="system",
            action_type=ActionType.PROCESSED,
            previous_status=ReviewStatus.PROCESSING,
            new_status=decision.decision,
            reason=decision.decision_reason,
        )

    def get_review_detail(self, review_id: str) -> dict:
        review = self.repo.get_review(review_id)
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")
        return {
            **review.model_dump(),
            "text_analysis": self.repo.get_text_analysis(review_id).model_dump() if self.repo.get_text_analysis(review_id) else None,
            "image_analysis": [item.model_dump() for item in self.repo.get_image_analysis_for_review(review_id)],
            "video_analysis": [item.model_dump() for item in self.repo.get_video_analysis_for_review(review_id)],
            "fusion_decision": self.repo.get_fusion_decision(review_id).model_dump() if self.repo.get_fusion_decision(review_id) else None,
            "moderation_logs": [item.model_dump() for item in self.repo.get_logs(review_id)],
        }

    def publish_review(self, review_id: str, request: ManualModerationRequest) -> Review:
        """Publish a review - runs through pipeline to validate consistency."""
        review = self.repo.get_review(review_id)
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        previous_status = review.status

        # Re-analyze review using pipeline before publishing
        text_analysis = self.repo.get_text_analysis(review_id)
        if not text_analysis:
            # If no analysis exists yet, analyze now
            text_analysis = self.text_service.analyze(review)
            self.repo.save_text_analysis(text_analysis)

        media_items = self.repo.get_review_media(review_id)
        media_score = 0.6 if media_items else 0.5

        rating_signal = self.rating_service.detect_mismatch(review.star_rating, text_analysis.overall_score, media_score)
        config = self.config_service.get()

        # Get fusion decision to validate the review
        decision = self.fusion_service.decide(
            review_id=review_id,
            config=config,
            text_analysis=text_analysis,
            rating_signal=rating_signal,
            media_score=media_score,
            image_findings=[],
            video_findings=[],
        )

        # If there's a severe mismatch, keep as draft instead of publishing
        if rating_signal["mismatch"] and rating_signal["delta"] >= 0.50:
            final_status = ReviewStatus.PENDING_MANUAL_REVIEW
            reason = f"Pipeline validation: Severe mismatch detected. Text sentiment: {text_analysis.overall_sentiment}, Rating score: {rating_signal['rating_score']}. Kept as draft for review."
        elif decision.decision != ReviewStatus.PUBLISHED:
            # Pipeline recommends not publishing
            final_status = decision.decision
            reason = f"Pipeline validation: {decision.decision_reason}"
        else:
            # Pipeline validates - safe to publish
            final_status = ReviewStatus.PUBLISHED
            reason = request.reason

        updated = self.repo.update_review_status(review_id, final_status, is_published=(final_status == ReviewStatus.PUBLISHED))
        self.audit_service.log(
            review_id,
            action_by=request.actor,
            action_type=ActionType.MANUAL_OVERRIDE,
            previous_status=previous_status,
            new_status=final_status,
            reason=reason,
        )
        return updated

    def reject_review(self, review_id: str, request: ManualModerationRequest) -> Review:
        review = self.repo.get_review(review_id)
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")
        previous_status = review.status
        updated = self.repo.update_review_status(review_id, ReviewStatus.REJECTED, is_published=False)
        self.audit_service.log(
            review_id,
            action_by=request.actor,
            action_type=ActionType.MANUAL_OVERRIDE,
            previous_status=previous_status,
            new_status=ReviewStatus.REJECTED,
            reason=request.reason,
        )
        return updated

    def unpublish_review(self, review_id: str, request: ManualModerationRequest) -> Review:
        review = self.repo.get_review(review_id)
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")
        previous_status = review.status
        updated = self.repo.update_review_status(review_id, ReviewStatus.UNPUBLISHED, is_published=False)
        self.audit_service.log(
            review_id,
            action_by=request.actor,
            action_type=ActionType.UNPUBLISHED,
            previous_status=previous_status,
            new_status=ReviewStatus.UNPUBLISHED,
            reason=request.reason,
        )
        return updated
