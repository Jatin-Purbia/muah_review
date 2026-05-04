from enum import Enum


class ReviewStatus(str, Enum):
    SUBMITTED = "submitted"
    QUEUED = "queued"
    PROCESSING = "processing"
    PENDING_MANUAL_REVIEW = "pending_manual_review"
    APPROVED = "approved"
    PUBLISHED = "published"
    REJECTED = "rejected"
    FLAGGED = "flagged"
    UNPUBLISHED = "unpublished"
    FAILED = "failed"


class MediaType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"


class ActionType(str, Enum):
    SUBMITTED = "submitted"
    QUEUED = "queued"
    PROCESSED = "processed"
    PUBLISHED = "published"
    REJECTED = "rejected"
    FLAGGED = "flagged"
    UNPUBLISHED = "unpublished"
    CONFIG_UPDATED = "config_updated"
    MANUAL_OVERRIDE = "manual_override"


class ReviewCategory(str, Enum):
    DELIVERY = "Delivery"
    SERVICE = "Service"
    PRODUCTS = "Products"
    RETURNS = "Returns"
    WEBSITE = "Website"
    COMPLAINTS = "Complaints"
