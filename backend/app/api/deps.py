from functools import lru_cache

from app.core.config import get_settings
from app.models.domain import ModerationConfig
from app.repositories.memory import InMemoryRepository
from app.services.analysis import ImageAnalysisService, MediaScoringService, RatingAnalysisService, TextAnalysisService, VideoAnalysisService
from app.services.analytics import SellerAnalyticsService
from app.services.audit import AuditLogService
from app.services.fusion import FusionModerationService
from app.services.moderation_config import ModerationConfigService
from app.services.review_workflow import ReviewWorkflowService


@lru_cache
def get_repo() -> InMemoryRepository:
    settings = get_settings()
    return InMemoryRepository(
        ModerationConfig(
            auto_publish_enabled=settings.moderation_auto_publish_enabled,
            publish_threshold=settings.moderation_publish_threshold,
            manual_review_threshold=settings.moderation_manual_review_threshold,
            toxicity_threshold=settings.moderation_toxicity_threshold,
            spam_threshold=settings.moderation_spam_threshold,
            pipeline_enabled=settings.moderation_pipeline_enabled,
        )
    )


@lru_cache
def get_review_workflow_service() -> ReviewWorkflowService:
    repo = get_repo()
    config_service = ModerationConfigService(repo)
    audit_service = AuditLogService(repo)
    return ReviewWorkflowService(
        repo=repo,
        config_service=config_service,
        audit_service=audit_service,
        text_service=TextAnalysisService(),
        rating_service=RatingAnalysisService(),
        image_service=ImageAnalysisService(),
        video_service=VideoAnalysisService(),
        media_scoring_service=MediaScoringService(),
        fusion_service=FusionModerationService(),
    )


@lru_cache
def get_config_service() -> ModerationConfigService:
    return ModerationConfigService(get_repo())


@lru_cache
def get_seller_analytics_service() -> SellerAnalyticsService:
    return SellerAnalyticsService(get_repo())
