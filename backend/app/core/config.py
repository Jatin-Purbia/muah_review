from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Review Moderation Service"
    app_version: str = "1.0.0"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:4200"])

    moderation_auto_publish_enabled: bool = True
    moderation_pipeline_enabled: bool = True
    moderation_publish_threshold: float = 0.75
    moderation_manual_review_threshold: float = 0.45
    moderation_toxicity_threshold: float = 0.8
    moderation_spam_threshold: float = 0.85

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2:1.5b"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="REVIEW_", extra="ignore")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
