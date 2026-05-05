import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.domain import ModerationConfig, ReviewTextAnalysis
from app.models.enums import ReviewStatus
from app.services.fusion import FusionModerationService


class FusionModerationServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = FusionModerationService()
        self.config = ModerationConfig(
            auto_publish_enabled=True,
            publish_threshold=0.75,
            manual_review_threshold=0.45,
            toxicity_threshold=0.8,
            spam_threshold=0.85,
            pipeline_enabled=True,
        )

    def test_publishes_clean_high_confidence_review(self) -> None:
        analysis = ReviewTextAnalysis(
            review_id="r1",
            overall_sentiment="positive",
            overall_score=0.92,
            spam_score=0.02,
            toxicity_score=0.01,
            confidence_score=0.92,
            aspect_json=[{"aspect": "product_quality", "sentiment": "positive", "score": 0.92}],
            summary="Customer strongly liked the product.",
        )

        decision = self.service.decide(
            review_id="r1",
            config=self.config,
            text_analysis=analysis,
            rating_signal={"rating_score": 1.0, "evidence_score": 0.9, "delta": 0.1, "mismatch": False},
            media_score=0.8,
            image_findings=[],
            video_findings=[],
        )

        self.assertEqual(decision.decision, ReviewStatus.PUBLISHED)
        self.assertGreaterEqual(decision.final_score, self.config.publish_threshold)

    def test_flags_toxic_review_before_other_scoring(self) -> None:
        analysis = ReviewTextAnalysis(
            review_id="r2",
            overall_sentiment="negative",
            overall_score=0.2,
            spam_score=0.1,
            toxicity_score=0.95,
            confidence_score=0.92,
            aspect_json=[],
            summary="Toxic review.",
        )

        decision = self.service.decide(
            review_id="r2",
            config=self.config,
            text_analysis=analysis,
            rating_signal={"rating_score": 0.0, "evidence_score": 0.2, "delta": 0.2, "mismatch": False},
            media_score=0.5,
            image_findings=[],
            video_findings=[],
        )

        self.assertEqual(decision.decision, ReviewStatus.FLAGGED)
        self.assertIn("Toxicity threshold exceeded", decision.decision_reason)


if __name__ == "__main__":
    unittest.main()
