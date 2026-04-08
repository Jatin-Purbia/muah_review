from app.models.domain import ModerationConfig, ReviewFusionDecision, ReviewTextAnalysis
from app.models.enums import ReviewStatus


class FusionModerationService:
    def decide(
        self,
        *,
        review_id: str,
        config: ModerationConfig,
        text_analysis: ReviewTextAnalysis,
        rating_signal: dict,
        media_score: float,
        image_findings: list[dict],
        video_findings: list[dict],
    ) -> ReviewFusionDecision:
        if not config.pipeline_enabled:
            return ReviewFusionDecision(
                review_id=review_id,
                final_score=0.0,
                decision=ReviewStatus.PENDING_MANUAL_REVIEW,
                decision_reason="Pipeline disabled by super admin configuration.",
                conflict_flags_json=[{"type": "pipeline_disabled"}],
                publish_recommendation=False,
                analytics_payload={"sentiment": text_analysis.overall_sentiment},
            )

        if text_analysis.toxicity_score >= config.toxicity_threshold:
            return ReviewFusionDecision(
                review_id=review_id,
                final_score=0.05,
                decision=ReviewStatus.FLAGGED,
                decision_reason="Toxicity threshold exceeded.",
                conflict_flags_json=[{"type": "toxicity", "value": text_analysis.toxicity_score}],
                publish_recommendation=False,
                analytics_payload={"sentiment": text_analysis.overall_sentiment},
            )

        if text_analysis.spam_score >= config.spam_threshold:
            return ReviewFusionDecision(
                review_id=review_id,
                final_score=0.1,
                decision=ReviewStatus.REJECTED,
                decision_reason="Spam threshold exceeded.",
                conflict_flags_json=[{"type": "spam", "value": text_analysis.spam_score}],
                publish_recommendation=False,
                analytics_payload={"sentiment": text_analysis.overall_sentiment},
            )

        conflict_flags: list[dict] = []
        if rating_signal["mismatch"]:
            conflict_flags.append({"type": "rating_mismatch", "delta": rating_signal["delta"]})
        if image_findings or video_findings:
            conflict_flags.append({"type": "media_findings", "count": len(image_findings) + len(video_findings)})

        final_score = round(
            (text_analysis.overall_score * 0.45) +
            (rating_signal["rating_score"] * 0.25) +
            (media_score * 0.30),
            2,
        )

        if rating_signal["mismatch"] or image_findings or video_findings:
            if final_score >= config.publish_threshold:
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = "High confidence review has modality conflicts and requires manual review."
            elif final_score >= config.manual_review_threshold:
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = "Mixed evidence across text, rating, or media."
            else:
                decision = ReviewStatus.REJECTED
                reason = "Low score with conflicting evidence."
        elif final_score >= config.publish_threshold and config.auto_publish_enabled:
            decision = ReviewStatus.PUBLISHED
            reason = "Review meets auto-publish threshold."
        elif final_score >= config.manual_review_threshold:
            decision = ReviewStatus.PENDING_MANUAL_REVIEW
            reason = "Review is acceptable but does not meet auto-publish threshold."
        else:
            decision = ReviewStatus.REJECTED
            reason = "Review score below manual review threshold."

        return ReviewFusionDecision(
            review_id=review_id,
            final_score=final_score,
            decision=decision,
            decision_reason=reason,
            conflict_flags_json=conflict_flags,
            publish_recommendation=decision == ReviewStatus.PUBLISHED,
            analytics_payload={
                "sentiment": text_analysis.overall_sentiment,
                "summary": text_analysis.summary,
                "top_aspects": text_analysis.aspect_json,
            },
        )
