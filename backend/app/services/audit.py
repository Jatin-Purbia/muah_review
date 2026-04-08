from app.models.domain import ModerationLog
from app.models.enums import ActionType, ReviewStatus
from app.repositories.memory import InMemoryRepository


class AuditLogService:
    def __init__(self, repo: InMemoryRepository) -> None:
        self.repo = repo

    def log(
        self,
        review_id: str,
        *,
        action_by: str,
        action_type: ActionType,
        new_status: ReviewStatus,
        reason: str,
        previous_status: ReviewStatus | None = None,
    ) -> ModerationLog:
        log = ModerationLog(
            review_id=review_id,
            action_by=action_by,
            action_type=action_type,
            previous_status=previous_status,
            new_status=new_status,
            reason=reason,
        )
        return self.repo.save_log(log)
