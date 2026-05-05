from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.api.deps import get_config_service, get_product_catalog_service, get_repo, get_review_workflow_service, get_seller_analytics_service
from app.repositories.base import ReviewRepository
from app.schemas.admin import ManualModerationRequest, ModerationConfigPatchRequest
from app.schemas.review import ReviewCreateRequest
from app.services.analytics import SellerAnalyticsService
from app.services.moderation_config import ModerationConfigService
from app.services.products import ProductCatalogService
from app.services.review_workflow import ReviewWorkflowService

router = APIRouter()
_ADMIN_SUMMARY_CACHE: dict[str, object] = {"value": None, "expires_at": datetime.min.replace(tzinfo=timezone.utc)}


def _review_documents(repo: ReviewRepository) -> list[dict]:
    if hasattr(repo, "list_review_documents"):
        return repo.list_review_documents()
    return []


def _cached_admin_summary(repo: ReviewRepository) -> dict:
    now = datetime.now(timezone.utc)
    cached_value = _ADMIN_SUMMARY_CACHE.get("value")
    expires_at = _ADMIN_SUMMARY_CACHE.get("expires_at")
    if cached_value and isinstance(expires_at, datetime) and expires_at > now:
        return cached_value

    documents = _review_documents(repo)
    summary = _admin_review_summary_from_documents(documents)
    _ADMIN_SUMMARY_CACHE["value"] = summary
    _ADMIN_SUMMARY_CACHE["expires_at"] = now + timedelta(seconds=45)
    return summary


def _reset_admin_summary_cache() -> None:
    _ADMIN_SUMMARY_CACHE["value"] = None
    _ADMIN_SUMMARY_CACHE["expires_at"] = datetime.min.replace(tzinfo=timezone.utc)


def _review_payload_from_document(document: dict, product_map: dict[str, dict]) -> dict:
    review = dict(document.get("review", {}))
    product = product_map.get(review.get("product_id"), {})
    review["text_analysis"] = document.get("text_analysis")
    review["fusion_decision"] = document.get("fusion_decision")
    review["product_name"] = product.get("name", review.get("product_id"))
    review["seller_name"] = product.get("seller_name", review.get("seller_id"))
    return review


def _review_detail_payload(review, repo: ReviewRepository, products: ProductCatalogService) -> dict:
    detail = review.model_dump()
    text_analysis = repo.get_text_analysis(review.id)
    fusion_decision = repo.get_fusion_decision(review.id)
    product = products.get_product(review.product_id)
    detail["text_analysis"] = text_analysis.model_dump() if text_analysis else None
    detail["fusion_decision"] = fusion_decision.model_dump() if fusion_decision else None
    detail["product_name"] = product["name"] if product else review.product_id
    detail["seller_name"] = product["seller_name"] if product else review.seller_id
    return detail


def _admin_review_summary(reviews: list) -> dict:
    total_reviews = len(reviews)
    published_count = sum(1 for review in reviews if review.is_published)
    unpublished_count = total_reviews - published_count
    average_rating = round(sum(review.star_rating for review in reviews) / total_reviews, 1) if total_reviews else 0.0
    rating_distribution = [
        {"star": star, "count": sum(1 for review in reviews if review.star_rating == star)}
        for star in [5, 4, 3, 2, 1]
    ]
    category_map: dict[str, list[int]] = {}
    for review in reviews:
        key = review.category.value
        category_map.setdefault(key, []).append(review.star_rating)
    category_stats = [
        {
            "id": index + 1,
            "category": category,
            "reviewerCount": len(ratings),
            "reviewCount": len(ratings),
            "rating": round(sum(ratings) / len(ratings), 1) if ratings else 0.0,
        }
        for index, (category, ratings) in enumerate(sorted(category_map.items()))
    ]
    return {
        "total_reviews": total_reviews,
        "published_count": published_count,
        "unpublished_count": unpublished_count,
        "average_rating": average_rating,
        "rating_distribution": rating_distribution,
        "category_stats": category_stats,
    }


def _admin_review_summary_from_documents(documents: list[dict]) -> dict:
    total_reviews = len(documents)
    published_count = sum(1 for document in documents if document.get("review", {}).get("is_published"))
    average_rating = round(
        sum(int(document.get("review", {}).get("star_rating", 0)) for document in documents) / total_reviews,
        1,
    ) if total_reviews else 0.0
    rating_distribution = [
        {
            "star": star,
            "count": sum(1 for document in documents if int(document.get("review", {}).get("star_rating", 0)) == star),
        }
        for star in [5, 4, 3, 2, 1]
    ]
    category_map: dict[str, list[int]] = {}
    for document in documents:
        review = document.get("review", {})
        key = str(review.get("category", "Products"))
        category_map.setdefault(key, []).append(int(review.get("star_rating", 0)))
    category_stats = [
        {
            "id": index + 1,
            "category": category,
            "reviewerCount": len(ratings),
            "reviewCount": len(ratings),
            "rating": round(sum(ratings) / len(ratings), 1) if ratings else 0.0,
        }
        for index, (category, ratings) in enumerate(sorted(category_map.items()))
    ]
    return {
        "total_reviews": total_reviews,
        "published_count": published_count,
        "unpublished_count": total_reviews - published_count,
        "average_rating": average_rating,
        "rating_distribution": rating_distribution,
        "category_stats": category_stats,
    }


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
    _reset_admin_summary_cache()
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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
) -> dict:
    reviews = analytics.list_reviews(seller_id, products.product_map())
    total_items = len(reviews)
    start = (page - 1) * page_size
    data = reviews[start:start + page_size]
    total_pages = max(1, (total_items + page_size - 1) // page_size)
    return {
        "data": data,
        "pager": {
            "totalItems": total_items,
            "currentPage": page,
            "numberPerPage": page_size,
            "totalPages": total_pages,
        },
    }


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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    status: str = Query(default="all"),
    search: str = Query(default=""),
    rating: int = Query(default=0, ge=0, le=5),
    category: str = Query(default=""),
    repo: ReviewRepository = Depends(get_repo),
    products: ProductCatalogService = Depends(get_product_catalog_service),
) -> dict:
    product_map = products.product_map()
    if hasattr(repo, "find_review_documents") and not search.strip():
        review_filter: dict[str, object] = {}
        if status == "published":
            review_filter["review.is_published"] = True
        elif status == "unpublished":
            review_filter["review.is_published"] = False
        if rating > 0:
            review_filter["review.star_rating"] = rating
        if category.strip():
            review_filter["review.category"] = category.strip()

        total_items = repo.count_review_documents(review_filter) if hasattr(repo, "count_review_documents") else 0
        start = (page - 1) * page_size
        page_documents = repo.find_review_documents(
            review_filter,
            projection={
                "review": 1,
                "text_analysis.overall_score": 1,
                "text_analysis.aspect_json": 1,
                "fusion_decision.final_score": 1,
                "fusion_decision.decision": 1,
            },
            skip=start,
            limit=page_size,
        )
        total_pages = max(1, (total_items + page_size - 1) // page_size)
        return {
            "data": [_review_payload_from_document(document, product_map) for document in page_documents],
            "pager": {
                "totalItems": total_items,
                "currentPage": page,
                "numberPerPage": page_size,
                "totalPages": total_pages,
            },
        }

    documents = _review_documents(repo)
    if documents:
        documents = sorted(documents, key=lambda document: document.get("review", {}).get("created_at", ""), reverse=True)
        summary = _admin_review_summary_from_documents(documents)

        filtered = documents
        if status == "published":
            filtered = [document for document in filtered if document.get("review", {}).get("is_published")]
        elif status == "unpublished":
            filtered = [document for document in filtered if not document.get("review", {}).get("is_published")]

        if search.strip():
            query = search.strip().lower()
            filtered = [
                document for document in filtered
                if query in str(document.get("review", {}).get("title", "")).lower()
                or query in str(document.get("review", {}).get("description", "")).lower()
                or query in str(product_map.get(document.get("review", {}).get("product_id"), {}).get("name", "")).lower()
                or query in str(product_map.get(document.get("review", {}).get("product_id"), {}).get("seller_name", "")).lower()
            ]

        if rating > 0:
            filtered = [document for document in filtered if int(document.get("review", {}).get("star_rating", 0)) == rating]

        if category.strip():
            normalized_category = category.strip().lower()
            filtered = [
                document for document in filtered
                if str(document.get("review", {}).get("category", "")).lower() == normalized_category
            ]

        total_items = len(filtered)
        start = (page - 1) * page_size
        page_documents = filtered[start:start + page_size]
        total_pages = max(1, (total_items + page_size - 1) // page_size)

        return {
            "data": [_review_payload_from_document(document, product_map) for document in page_documents],
            "pager": {
                "totalItems": total_items,
                "currentPage": page,
                "numberPerPage": page_size,
                "totalPages": total_pages,
            },
            "summary": summary,
        }

    reviews = sorted(repo.list_reviews(), key=lambda review: review.created_at, reverse=True)
    summary = _admin_review_summary(reviews)

    filtered = reviews
    if status == "published":
        filtered = [review for review in filtered if review.is_published]
    elif status == "unpublished":
        filtered = [review for review in filtered if not review.is_published]

    if search.strip():
        query = search.strip().lower()
        filtered = [
            review for review in filtered
            if query in review.title.lower()
            or query in review.description.lower()
            or query in (products.get_product(review.product_id) or {}).get("name", "").lower()
            or query in (products.get_product(review.product_id) or {}).get("seller_name", "").lower()
        ]

    if rating > 0:
        filtered = [review for review in filtered if review.star_rating == rating]

    if category.strip():
        normalized_category = category.strip().lower()
        filtered = [review for review in filtered if review.category.value.lower() == normalized_category]

    total_items = len(filtered)
    start = (page - 1) * page_size
    page_reviews = filtered[start:start + page_size]
    total_pages = max(1, (total_items + page_size - 1) // page_size)

    return {
        "data": [_review_detail_payload(review, repo, products) for review in page_reviews],
        "pager": {
            "totalItems": total_items,
            "currentPage": page,
            "numberPerPage": page_size,
            "totalPages": total_pages,
        },
        "summary": summary,
    }


@router.get("/admin/reviews/queue")
def get_admin_review_queue(
    repo: ReviewRepository = Depends(get_repo),
    products: ProductCatalogService = Depends(get_product_catalog_service),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[dict]:
    product_map = products.product_map()
    if hasattr(repo, "find_review_documents"):
        queue_documents: list[dict] = []
        for status_value in ("pending_manual_review", "flagged", "failed"):
            remaining = max(limit - len(queue_documents), 0)
            if remaining == 0:
                break
            queue_documents.extend(
                repo.find_review_documents(
                    {"review.status": status_value},
                    projection={
                        "review": 1,
                        "text_analysis.overall_score": 1,
                        "text_analysis.aspect_json": 1,
                        "fusion_decision.final_score": 1,
                        "fusion_decision.decision": 1,
                    },
                    limit=remaining,
                )
            )
        queue_documents = sorted(
            queue_documents,
            key=lambda document: document.get("review", {}).get("created_at", ""),
            reverse=True,
        )[:limit]
        return [_review_payload_from_document(document, product_map) for document in queue_documents]

    documents = _review_documents(repo)
    if documents:
        queue_documents = [
            document for document in documents
            if document.get("review", {}).get("status") in {"pending_manual_review", "flagged", "failed"}
        ]
        queue_documents = sorted(
            queue_documents,
            key=lambda document: document.get("review", {}).get("created_at", ""),
            reverse=True,
        )[:limit]
        return [_review_payload_from_document(document, product_map) for document in queue_documents]

    queue_reviews = [
        review for review in repo.list_reviews()
        if review.status.value in {"pending_manual_review", "flagged", "failed"}
    ]
    queue_reviews = sorted(queue_reviews, key=lambda review: review.created_at, reverse=True)[:limit]
    return [_review_detail_payload(review, repo, products) for review in queue_reviews]


@router.get("/admin/reviews/summary")
def get_admin_reviews_summary(
    repo: ReviewRepository = Depends(get_repo),
) -> dict:
    return _cached_admin_summary(repo)


@router.post("/admin/reviews/{review_id}/publish")
def admin_publish_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    _reset_admin_summary_cache()
    return workflow.publish_review(review_id, request).model_dump()


@router.post("/admin/reviews/{review_id}/reject")
def admin_reject_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    _reset_admin_summary_cache()
    return workflow.reject_review(review_id, request).model_dump()


@router.post("/admin/reviews/{review_id}/unpublish")
def admin_unpublish_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    _reset_admin_summary_cache()
    return workflow.unpublish_review(review_id, request).model_dump()


@router.delete("/admin/reviews/{review_id}")
def admin_delete_review(
    review_id: str,
    request: ManualModerationRequest,
    workflow: ReviewWorkflowService = Depends(get_review_workflow_service),
) -> dict:
    _reset_admin_summary_cache()
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
