import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import BackgroundTasks

from app.models.domain import ModerationConfig, ReviewTextAnalysis
from app.models.enums import ActionType, ReviewCategory, ReviewStatus
from app.repositories.memory import InMemoryRepository
from app.schemas.admin import ManualModerationRequest
from app.schemas.review import ReviewCreateRequest
from app.services.analysis import RatingAnalysisService
from app.services.audit import AuditLogService
from app.services.fusion import FusionModerationService
from app.services.moderation_config import ModerationConfigService
from app.services.review_workflow import ReviewWorkflowService


class StubTextAnalysisService:
    def analyze(self, review):
        return ReviewTextAnalysis(
            review_id=review.id,
            overall_sentiment="positive",
            overall_score=0.9,
            spam_score=0.02,
            toxicity_score=0.01,
            confidence_score=0.92,
            aspect_json=[{"aspect": "product_quality", "sentiment": "positive", "score": 0.9}],
            summary="Looks good.",
        )


class FailingTextAnalysisService:
    def analyze(self, review):
        raise RuntimeError("ollama offline")


class ReviewWorkflowServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = InMemoryRepository(ModerationConfig())
        self.config_service = ModerationConfigService(self.repo)
        self.audit_service = AuditLogService(self.repo)

    def _create_workflow(self, text_service) -> ReviewWorkflowService:
        return ReviewWorkflowService(
            repo=self.repo,
            config_service=self.config_service,
            audit_service=self.audit_service,
            text_service=text_service,
            rating_service=RatingAnalysisService(),
            fusion_service=FusionModerationService(),
        )

    def _submit_review(self, workflow: ReviewWorkflowService) -> str:
        payload = ReviewCreateRequest(
            user_id="user-1",
            seller_id="seller-1",
            product_id="product-1",
            title="Great jacket",
            description="Love the fit and quality.",
            star_rating=5,
            category=ReviewCategory.PRODUCTS,
            media=[],
        )
        review = workflow.submit_review(payload, BackgroundTasks())
        return review.id

    def test_processing_failure_marks_review_failed_and_audits_reason(self) -> None:
        workflow = self._create_workflow(FailingTextAnalysisService())
        review_id = self._submit_review(workflow)

        workflow.process_review(review_id)

        review = self.repo.get_review(review_id)
        logs = self.repo.get_logs(review_id)
        self.assertIsNotNone(review)
        self.assertEqual(review.status, ReviewStatus.FAILED)
        self.assertEqual(logs[-1].new_status, ReviewStatus.FAILED)
        self.assertIn("Processing failed", logs[-1].reason)

    def test_delete_review_soft_deletes_and_preserves_audit_log(self) -> None:
        workflow = self._create_workflow(StubTextAnalysisService())
        review_id = self._submit_review(workflow)

        deleted = workflow.delete_review(
            review_id,
            ManualModerationRequest(reason="No longer needed", actor="super-admin"),
        )

        review = self.repo.get_review(review_id)
        logs = self.repo.get_logs(review_id)
        self.assertTrue(deleted["deleted"])
        self.assertIsNotNone(review)
        self.assertTrue(review.is_deleted)
        self.assertEqual(self.repo.list_reviews(), [])
        self.assertEqual(logs[-1].action_type, ActionType.DELETED)


if __name__ == "__main__":
    unittest.main()
