from __future__ import annotations

import json
import re
from base64 import b64decode
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "unknown-seller"


UUID_REGEX = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class ProductCatalogService:
    def __init__(self, catalog_path: Path) -> None:
        self.catalog_path = catalog_path

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

    @lru_cache
    def list_products(self) -> list[dict]:
        payload = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        result: list[dict] = []
        for product in payload.get("data", []):
            decoded_brand_id = self._decode_brand_id(product.get("brandId"))
            seller_name = self._infer_brand_name(product)
            seller_id = decoded_brand_id or product.get("brandId") or _slugify(seller_name)
            first_image = None
            for detail in product.get("productDetails", []):
                images = detail.get("productImages") or []
                if images:
                    first_image = images[0].get("imageUrl")
                    break
            result.append(
                {
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
            )
        return result

    @lru_cache
    def product_map(self) -> dict[str, dict]:
        return {product["id"]: product for product in self.list_products() if product.get("id")}

    def get_product(self, product_id: str) -> dict | None:
        return self.product_map().get(product_id)
