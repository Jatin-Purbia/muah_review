from pydantic import BaseModel, Field


class ModerationConfigPatchRequest(BaseModel):
    auto_publish_enabled: bool | None = None
    publish_threshold: float | None = Field(default=None, ge=0, le=1)
    manual_review_threshold: float | None = Field(default=None, ge=0, le=1)
    toxicity_threshold: float | None = Field(default=None, ge=0, le=1)
    spam_threshold: float | None = Field(default=None, ge=0, le=1)
    pipeline_enabled: bool | None = None


class ManualModerationRequest(BaseModel):
    reason: str = Field(min_length=1)
    actor: str = "super-admin"
