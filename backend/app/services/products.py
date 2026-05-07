from __future__ import annotations

import re
import time
from base64 import b64decode
from threading import Lock
from urllib.parse import unquote

import httpx


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "unknown-seller"


UUID_REGEX = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class ProductCatalogService:
    def __init__(
        self,
        *,
        products_api_url: str,
        categories_api_url: str,
        categories_ttl_seconds: int = 600,
        products_ttl_seconds: int = 180,
        page_size: int = 500,
    ) -> None:
        self.products_api_url = products_api_url
        self.categories_api_url = categories_api_url
        self.categories_ttl_seconds = categories_ttl_seconds
        self.products_ttl_seconds = products_ttl_seconds
        self.page_size = page_size
        self._lock = Lock()
        self._categories_cache: list[dict] = []
        self._categories_expires_at = 0.0
        self._products_cache: list[dict] = []
        self._products_expires_at = 0.0

    def _decode_brand_id(self, value: str | None) -> str | None:
        if not value:
            return None

        direct_value = value.strip()
        if UUID_REGEX.fullmatch(direct_value):
            return direct_value

        decoded_candidates = {direct_value}
        try:
            decoded_candidates.add(unquote(direct_value))
        except Exception:
            pass

        for candidate in decoded_candidates:
            normalized = candidate.replace("-", "+").replace("_", "/")
            padded = normalized + ("=" * ((4 - (len(normalized) % 4)) % 4))

            try:
                base64_decoded = b64decode(padded).decode("utf-8").strip()
            except Exception:
                continue

            if UUID_REGEX.fullmatch(base64_decoded):
                return base64_decoded

        return None

    def _infer_brand_name(self, product: dict) -> str:
        for detail in product.get("productDetails", []):
            sku = (detail.get("sku") or "").strip()
            if not sku:
                continue
            parts = sku.split("-")
            if len(parts) >= 4 and parts[1] and parts[1].upper() != "SKU":
                return parts[1].strip()
        brand_id = (product.get("brandId") or "").strip()
        return brand_id or "Unknown Seller"

    def _fetch_json(self, method: str, url: str, *, json_body: dict | None = None) -> object:
        with httpx.Client(timeout=30.0) as client:
            response = client.request(
                method,
                url,
                json=json_body,
                headers={"Accept": "application/json, text/plain, */*"},
            )
            response.raise_for_status()
            return response.json()

    def _extract_category_entries(self, payload: object) -> list[dict]:
        if isinstance(payload, list):
            raw_items = payload
        elif isinstance(payload, dict):
            raw_items = payload.get("data") or payload.get("items") or payload.get("categories") or []
        else:
            raw_items = []

        categories: list[dict] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            category_id = item.get("id") or item.get("identifier") or item.get("categoryId")
            name = item.get("name") or item.get("title") or item.get("displayName")
            if category_id:
                categories.append({"id": str(category_id), "name": str(name or category_id)})
        return categories

    def _refresh_categories(self) -> list[dict]:
        payload = self._fetch_json("GET", self.categories_api_url)
        categories = self._extract_category_entries(payload)
        with self._lock:
            self._categories_cache = categories
            self._categories_expires_at = time.monotonic() + self.categories_ttl_seconds
        return categories

    def _list_categories(self) -> list[dict]:
        now = time.monotonic()
        with self._lock:
            if self._categories_cache and self._categories_expires_at > now:
                return list(self._categories_cache)
        return self._refresh_categories()

    def _extract_product_items(self, payload: object) -> tuple[list[dict], int | None]:
        if isinstance(payload, dict):
            raw_items = payload.get("data") or payload.get("items") or payload.get("products") or []
            pager = payload.get("pager") if isinstance(payload.get("pager"), dict) else {}
            total_items = pager.get("totalItems")
            try:
                return list(raw_items), int(total_items) if total_items is not None else None
            except (TypeError, ValueError):
                return list(raw_items), None
        if isinstance(payload, list):
            return list(payload), None
        return [], None

    def _build_remote_payload(self, category_ids: list[str], current_page: int) -> dict:
        return {
            "numberPerPage": self.page_size,
            "currentPage": current_page,
            "name": None,
            "brandIdList": [],
            "colourIdList": [],
            "sizeIdList": [],
            "categoryIdList": category_ids,
            "CurrentPage": current_page,
        }

    def _refresh_remote_products(self) -> list[dict]:
        category_ids = [category["id"] for category in self._list_categories()]
        if not category_ids:
            with self._lock:
                self._products_cache = []
                self._products_expires_at = time.monotonic() + self.products_ttl_seconds
            return []

        all_items: list[dict] = []
        current_page = 1
        total_items: int | None = None

        while True:
            payload = self._build_remote_payload(category_ids, current_page)
            page_payload = self._fetch_json("PUT", self.products_api_url, json_body=payload)
            page_items, payload_total = self._extract_product_items(page_payload)

            if payload_total is not None:
                total_items = payload_total

            if not page_items:
                break

            all_items.extend(page_items)

            if total_items is not None and len(all_items) >= total_items:
                break

            if len(page_items) < self.page_size:
                break

            current_page += 1

        normalized = [self._normalize_remote_product(product) for product in all_items]
        normalized = [product for product in normalized if product.get("id")]
        with self._lock:
            self._products_cache = normalized
            self._products_expires_at = time.monotonic() + self.products_ttl_seconds
        return normalized

    def _normalize_remote_product(self, product: dict) -> dict:
        decoded_brand_id = self._decode_brand_id(product.get("brandId"))
        seller_name = self._infer_brand_name(product)
        seller_id = decoded_brand_id or product.get("brandId") or _slugify(seller_name)

        first_image = None
        for detail in product.get("productDetails", []) or []:
            images = detail.get("productImages") or []
            if images:
                first_image = images[0].get("imageUrl")
                break

        return {
            "id": product.get("id"),
            "name": product.get("name") or "Untitled Product",
            "description": product.get("description") or "",
            "seller_id": seller_id,
            "seller_name": seller_name,
            "brand_id": decoded_brand_id or product.get("brandId"),
            "price": product.get("lowestPrice") or product.get("highestPrice") or 0,
            "image_url": first_image,
            "review_count": product.get("reviewCount") or 0,
            "review_avg": product.get("reviewAvg") or 0,
        }

    def list_products(self) -> list[dict]:
        now = time.monotonic()
        with self._lock:
            if self._products_cache and self._products_expires_at > now:
                return list(self._products_cache)
        return self._refresh_remote_products()

    def product_map(self) -> dict[str, dict]:
        return {product["id"]: product for product in self.list_products() if product.get("id")}

    def get_product(self, product_id: str) -> dict | None:
        return self.product_map().get(product_id)
