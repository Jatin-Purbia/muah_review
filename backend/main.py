from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

AZURE_API_URL = os.getenv("AZURE_API_URL", "").rstrip("/")
AUTH_TOKEN = os.getenv("AUTH_TOKEN", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:4200").split(",")

COGNITO_REGION     = os.getenv("COGNITO_REGION", "eu-west-2")
COGNITO_CLIENT_ID  = os.getenv("COGNITO_CLIENT_ID", "")
COGNITO_USERNAME   = os.getenv("COGNITO_USERNAME", "")
COGNITO_PASSWORD   = os.getenv("COGNITO_PASSWORD", "")


async def _cognito_refresh() -> bool:
    """Fetch a fresh Cognito IdToken and update the module-level AUTH_TOKEN.
    Returns True on success, False if credentials are not configured."""
    global AUTH_TOKEN
    if not (COGNITO_CLIENT_ID and COGNITO_USERNAME and COGNITO_PASSWORD):
        return False
    url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
    payload = {
        "AuthFlow": "USER_PASSWORD_AUTH",
        "ClientId": COGNITO_CLIENT_ID,
        "AuthParameters": {
            "USERNAME": COGNITO_USERNAME,
            "PASSWORD": COGNITO_PASSWORD,
        },
    }
    headers = {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        AUTH_TOKEN = r.json()["AuthenticationResult"]["IdToken"]
    return True


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """On startup, attempt to fetch a fresh Cognito token."""
    try:
        refreshed = await _cognito_refresh()
        if refreshed:
            print("[auth] Cognito token refreshed on startup.")
        else:
            print("[auth] Cognito credentials not configured — using AUTH_TOKEN from .env.")
    except Exception as exc:
        print(f"[auth] WARNING: Could not refresh Cognito token on startup: {exc}")
    yield


app = FastAPI(title="Muahh Review Management API", version="2.0.0", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Local publish-state overrides keyed by review id.
_publish_overrides: dict[str, bool] = {}


# ─── Request Models ───────────────────────────────────────────────────────────

class CreateSiteReviewDto(BaseModel):
    reviewCategory: str = Field(..., min_length=1)
    customerName: str = Field(..., min_length=1)
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(..., min_length=1)
    isActive: bool = False


class SiteReviewFilter(BaseModel):
    currentPage: Optional[int] = 1
    numberPerPage: Optional[int] = 500
    isActive: Optional[bool] = None
    reviewCategory: Optional[str] = None
    customer: Optional[str] = None
    comment: Optional[str] = None
    rating: Optional[int] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


class SiteReviewUpdate(BaseModel):
    id: str
    comment: str = Field(..., min_length=1)
    reviewCategory: str = Field(..., min_length=1)
    rating: int = Field(..., ge=1, le=5)


class ProductReviewCreate(BaseModel):
    heading: str = Field(..., min_length=1)
    comments: str = Field(..., min_length=1)
    rating: int = Field(..., ge=1, le=5)
    sizeFitRating: Optional[int] = Field(None, ge=1, le=5)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_headers() -> dict:
    return {
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json",
    }


def _apply_overrides(reviews: list[dict]) -> list[dict]:
    for r in reviews:
        rid = r.get("id")
        if rid in _publish_overrides:
            r["isActive"] = _publish_overrides[rid]
    return reviews


async def _proxy_get(path: str):
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.get(f"{AZURE_API_URL}/{path}", headers=get_headers())
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=str(e))


async def _proxy_post(path: str, body: dict, status_code: int = 200):
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(f"{AZURE_API_URL}/{path}", headers=get_headers(), json=body)
            if r.status_code == 401:
                if await _cognito_refresh():
                    r = await client.post(f"{AZURE_API_URL}/{path}", headers=get_headers(), json=body)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=str(e))


async def _proxy_put(path: str, body: dict = None):
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.put(
                f"{AZURE_API_URL}/{path}",
                headers=get_headers(),
                json=body or {},
            )
            if r.status_code == 401:
                if await _cognito_refresh():
                    r = await client.put(f"{AZURE_API_URL}/{path}", headers=get_headers(), json=body or {})
            r.raise_for_status()
            try:
                return r.json()
            except Exception:
                return {"status": "ok"}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=str(e))


async def _proxy_delete(path: str):
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.delete(f"{AZURE_API_URL}/{path}", headers=get_headers())
            if r.status_code == 401:
                if await _cognito_refresh():
                    r = await client.delete(f"{AZURE_API_URL}/{path}", headers=get_headers())
            r.raise_for_status()
            try:
                return r.json()
            except Exception:
                return {"status": "ok"}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# SITE REVIEWS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/site-reviews")
async def get_site_reviews():
    data = await _proxy_get("sitereviews")
    reviews = data if isinstance(data, list) else data.get("data", data.get("items", []))
    return _apply_overrides(reviews)


@app.get("/api/site-reviews/statistics")
async def get_site_review_statistics():
    return await _proxy_get("sitereviews/statistics")


@app.get("/api/site-reviews/user")
async def get_user_reviews():
    return await _proxy_get("sitereviews/user")


@app.get("/api/site-reviews/category/{category_key}")
async def get_reviews_by_category(category_key: str):
    return await _proxy_get(f"sitereviews/category/{category_key}")


# Must be declared AFTER all fixed-path GET routes to avoid matching them
@app.get("/api/site-reviews/{review_id}")
async def get_site_review_by_id(review_id: str):
    return await _proxy_get(f"sitereviews/{review_id}")


@app.post("/api/site-reviews", status_code=201)
async def create_site_review(dto: CreateSiteReviewDto):
    return await _proxy_post("sitereviews", dto.model_dump())


# PUT /search must be declared BEFORE PUT /{review_id} to avoid routing conflict
@app.put("/api/site-reviews/search")
async def search_site_reviews(f: SiteReviewFilter):
    payload = {k: v for k, v in f.model_dump().items() if v is not None}
    try:
        return await _proxy_put("sitereviews/search", payload)
    except HTTPException as exc:
        if exc.status_code in (401, 403):
            # Azure search endpoint unavailable — fall back to the GET list and
            # wrap it in the same paginated envelope the Angular service expects.
            data = await _proxy_get("sitereviews")
            reviews = data if isinstance(data, list) else data.get("data", data.get("items", []))
            reviews = _apply_overrides(reviews)
            return {"data": reviews, "pager": {"totalItems": len(reviews), "currentPage": 1, "numberPerPage": len(reviews), "totalPages": 1}}
        raise


@app.put("/api/site-reviews/{review_id}/status/{status}")
async def set_review_status(review_id: str, status: bool):
    try:
        result = await _proxy_put(f"sitereviews/{review_id}/status/{str(status).lower()}")
        _publish_overrides[review_id] = status
        return result if result != {"status": "ok"} else {"id": review_id, "isActive": status}
    except HTTPException as exc:
        if exc.status_code in (401, 403):
            # Upstream write permission not available — persist locally so the
            # GET/search fallback will reflect the correct published state.
            _publish_overrides[review_id] = status
            return {"id": review_id, "isActive": status, "_local": True}
        raise


@app.put("/api/site-reviews/{review_id}")
async def update_site_review(review_id: str, review: SiteReviewUpdate):
    return await _proxy_put(f"SiteReviews/{review_id}", review.model_dump())


@app.put("/api/site-reviews/{review_id}/helpful")
async def mark_helpful(review_id: str):
    return await _proxy_put(f"sitereviews/helpful/{review_id}")


@app.put("/api/site-reviews/{review_id}/unhelpful")
async def mark_unhelpful(review_id: str):
    return await _proxy_put(f"sitereviews/unhelpful/{review_id}")


@app.delete("/api/site-reviews/{review_id}")
async def delete_site_review(review_id: str):
    result = await _proxy_delete(f"sitereviews/{review_id}")
    _publish_overrides.pop(review_id, None)
    return result


@app.patch("/api/site-reviews/{review_id}/publish")
async def toggle_publish(review_id: str, published: bool):
    _publish_overrides[review_id] = published
    return {"id": review_id, "isActive": published}


# Backward-compat aliases kept so existing Angular calls still work
@app.get("/api/reviews")
async def get_reviews_compat():
    return await get_site_reviews()


@app.post("/api/reviews", status_code=201)
async def create_review_compat(dto: CreateSiteReviewDto):
    return await create_site_review(dto)


@app.patch("/api/reviews/{review_id}/publish")
async def toggle_publish_compat(review_id: str, published: bool):
    return await toggle_publish(review_id, published)


# ═══════════════════════════════════════════════════════════════════════════════
# PRODUCT REVIEWS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/products/{product_id}/reviews")
async def get_product_reviews(product_id: str):
    return await _proxy_get(f"products/{product_id}/review")


@app.get("/api/products/{product_id}/can-submit")
async def can_submit_review(product_id: str):
    return await _proxy_get(f"products/{product_id}/canSubmit")


@app.post("/api/products/{product_id}/reviews", status_code=201)
async def create_product_review(product_id: str, review: ProductReviewCreate):
    body = review.model_dump(exclude_none=True)
    body["productId"] = product_id
    return await _proxy_post(f"products/{product_id}/review", body)


@app.put("/api/products/{product_id}/reviews/{review_id}/like")
async def like_product_review(product_id: str, review_id: str):
    return await _proxy_put(f"products/{product_id}/review/{review_id}/like")


@app.put("/api/products/{product_id}/reviews/{review_id}/dislike")
async def dislike_product_review(product_id: str, review_id: str):
    return await _proxy_put(f"products/{product_id}/review/{review_id}/dislike")


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=4500, reload=True)
