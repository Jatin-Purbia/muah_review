from functools import lru_cache

from app.core.config import get_settings
from app.models.domain import ModerationConfig
from app.repositories.astra import AstraRepository
from app.repositories.base import ReviewRepository
from app.repositories.memory import InMemoryRepository
from app.services.analysis import OllamaTextAnalysisService, RatingAnalysisService
from app.services.analytics import SellerAnalyticsService
from app.services.audit import AuditLogService
from app.services.fusion import FusionModerationService
from app.services.moderation_config import ModerationConfigService
from app.services.products import ProductCatalogService
from app.services.review_workflow import ReviewWorkflowService


@lru_cache
def get_repo() -> ReviewRepository:
    settings = get_settings()
    config = ModerationConfig(
        auto_publish_enabled=settings.moderation_auto_publish_enabled,
        publish_threshold=settings.moderation_publish_threshold,
        manual_review_threshold=settings.moderation_manual_review_threshold,
        toxicity_threshold=settings.moderation_toxicity_threshold,
        spam_threshold=settings.moderation_spam_threshold,
        pipeline_enabled=settings.moderation_pipeline_enabled,
    )
    if settings.astra_db_enabled and settings.astra_db_endpoint and settings.astra_db_token:
        return AstraRepository(
            config=config,
            api_endpoint=settings.astra_db_endpoint,
            token=settings.astra_db_token,
        )
    return InMemoryRepository(config)


@lru_cache
def get_review_workflow_service() -> ReviewWorkflowService:
    repo = get_repo()
    config_service = ModerationConfigService(repo)
    audit_service = AuditLogService(repo)
    settings = get_settings()
    return ReviewWorkflowService(
        repo=repo,
        config_service=config_service,
        audit_service=audit_service,
        text_service=OllamaTextAnalysisService(
            model=settings.ollama_model,
            ollama_host=settings.ollama_host
        ),
        rating_service=RatingAnalysisService(),
        fusion_service=FusionModerationService(),
    )


@lru_cache
def get_config_service() -> ModerationConfigService:
    return ModerationConfigService(get_repo())


@lru_cache
def get_seller_analytics_service() -> SellerAnalyticsService:
    return SellerAnalyticsService(get_repo())


@lru_cache
def get_product_catalog_service() -> ProductCatalogService:
    return ProductCatalogService(catalog_path=get_settings_path())


def get_settings_path():
    from pathlib import Path
    return Path(__file__).resolve().parents[3] / "products.json"
