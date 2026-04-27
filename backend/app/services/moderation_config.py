from app.repositories.base import ReviewRepository
from app.schemas.admin import ModerationConfigPatchRequest


class ModerationConfigService:
    def __init__(self, repo: ReviewRepository) -> None:
        self.repo = repo

    def get(self):
        return self.repo.get_config()

    def update(self, patch: ModerationConfigPatchRequest):
        current = self.repo.get_config()
        updated = current.model_copy(update=patch.model_dump(exclude_none=True))
        return self.repo.update_config(updated)
