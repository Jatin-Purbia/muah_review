from fastapi import APIRouter, BackgroundTasks, Depends

from app.api.deps import get_config_service, get_product_catalog_service, get_repo, get_review_workflow_service, get_seller_analytics_service
from app.repositories.base import ReviewRepository
from app.schemas.admin import ManualModerationRequest, ModerationConfigPatchRequest
from app.schemas.review import ReviewCreateRequest
from app.services.analytics import SellerAnalyticsService
from app.services.moderation_config import ModerationConfigService
from app.services.products import ProductCatalogService
from app.services.review_workflow import ReviewWorkflowService

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/reviews", status_code=201)
def submit_review(
    payload: ReviewCreateRequest,
    background_tasks: BackgroundTasks,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    review = workflow.submit_review(payload, background_tasks)
    return {
        "review": review.model_dump(),
        "message": "Review accepted and queued for multimodal processing.",
    }


@router.get("/reviews/{review_id}")
def get_review_detail(
    review_id: str,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
    products: ProductCatalogService = Depends(get_product_catalog_service),
) -> dict:
    detail = workflow.get_review_detail(review_id)
    product = products.get_product(detail["product_id"])
    if product:
        detail["product_name"] = product["name"]
        detail["seller_name"] = product["seller_name"]
    return detail


@router.get("/products")
def get_products(products: ProductCatalogService = Depends(get_product_catalog_service)) -> list[dict]:
    return products.list_products()


@router.get("/seller/{seller_id}/reviews")
def get_seller_reviews(
    seller_id: str,
    analytics: SellerAnalyticsService = Depends(get_seller_analytics_service),
    products: ProductCatalogService = Depends(get_product_catalog_service),
) -> list[dict]:
    return analytics.list_reviews(seller_id, products.product_map())


@router.get("/seller/{seller_id}/analytics/summary")
def get_seller_summary(
    seller_id: str,
    analytics: SellerAnalyticsService = Depends(get_seller_analytics_service),
) -> dict:
    return analytics.summary(seller_id).model_dump()


@router.get("/seller/{seller_id}/analytics/trends")
def get_seller_trends(
    seller_id: str,
    analytics: SellerAnalyticsService = Depends(get_seller_analytics_service),
) -> list[dict]:
    return [item.model_dump() for item in analytics.trends(seller_id)]


@router.get("/seller/{seller_id}/analytics/aspects")
def get_seller_aspects(
    seller_id: str,
    analytics: SellerAnalyticsService = Depends(get_seller_analytics_service),
) -> list[dict]:
    return [item.model_dump() for item in analytics.aspects(seller_id)]


@router.get("/admin/reviews")
def get_admin_reviews(
    repo: ReviewRepository = Depends(get_repo),
    products: ProductCatalogService = Depends(get_product_catalog_service),
) -> list[dict]:
    result: list[dict] = []
    for review in repo.list_reviews():
        detail = review.model_dump()
        text_analysis = repo.get_text_analysis(review.id)
        fusion_decision = repo.get_fusion_decision(review.id)
        product = products.get_product(review.product_id)
        detail["text_analysis"] = text_analysis.model_dump() if text_analysis else None
        detail["fusion_decision"] = fusion_decision.model_dump() if fusion_decision else None
        detail["product_name"] = product["name"] if product else review.product_id
        detail["seller_name"] = product["seller_name"] if product else review.seller_id
        result.append(detail)
    return result


@router.post("/admin/reviews/{review_id}/publish")
def admin_publish_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    return workflow.publish_review(review_id, request).model_dump()


@router.post("/admin/reviews/{review_id}/reject")
def admin_reject_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    return workflow.reject_review(review_id, request).model_dump()


@router.post("/admin/reviews/{review_id}/unpublish")
def admin_unpublish_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    return workflow.unpublish_review(review_id, request).model_dump()


@router.delete("/admin/reviews/{review_id}")
def admin_delete_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    return workflow.delete_review(review_id, request)


@router.get("/admin/moderation-config")
def get_moderation_config(
    config_service: ModerationConfigService = Depends(get_config_service),
) -> dict:
    return config_service.get().model_dump()


@router.patch("/admin/moderation-config")
def patch_moderation_config(
    patch: ModerationConfigPatchRequest,
    config_service: ModerationConfigService = Depends(get_config_service),
) -> dict:
    return config_service.update(patch).model_dump()


@router.post("/internal/process-review/{review_id}")
def process_review_internal(
    review_id: str,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    workflow.process_review(review_id)
    return {"status": "processed", "review_id": review_id}
