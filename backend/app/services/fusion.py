from app.models.domain import ModerationConfig, ReviewFusionDecision, ReviewTextAnalysis
from app.models.enums import ReviewStatus


class FusionModerationService:
    @staticmethod
    def _clamp(value: float) -> float:
        return max(0.0, min(1.0, value))

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

        # Strong mismatch detection: rating vs text analysis conflict
        has_mismatch = rating_signal["mismatch"]
        mismatch_severity = rating_signal["delta"]

        safety_score = self._clamp(1.0 - ((text_analysis.toxicity_score * 0.6) + (text_analysis.spam_score * 0.4)))
        content_score = self._clamp((text_analysis.overall_score * 0.7) + (media_score * 0.3))
        base_score = round((content_score * 0.8) + (safety_score * 0.2), 2)

        if has_mismatch:
            mismatch_penalty = min(0.2, max(0.0, mismatch_severity - 0.35) * 0.6)
            final_score = round(self._clamp(base_score - mismatch_penalty), 2)

            text_type = "positive" if text_analysis.overall_score >= 0.65 else "negative" if text_analysis.overall_score <= 0.35 else "neutral"
            rating_type = "high" if rating_signal["rating_score"] >= 0.65 else "low" if rating_signal["rating_score"] <= 0.35 else "medium"

            summary_detail = (
                f"MISMATCH DETECTED: {text_type.upper()} text ({text_analysis.overall_score:.2f}) "
                f"contradicts {rating_type.upper()} rating ({rating_signal['rating_score']:.2f}). "
                f"Severity: {mismatch_severity:.0%}. Base score {base_score:.2f} adjusted to {final_score:.2f}."
            )
        else:
            final_score = base_score
            summary_detail = f"Text sentiment: {text_analysis.overall_sentiment}. Rating alignment: consistent."

        if has_mismatch:
            # Mismatch detected - require higher threshold or manual review
            if mismatch_severity >= 0.50:
                # Severe mismatch (e.g., 1 star with positive text or 5 stars with negative text)
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = f"⚠️ SEVERE MISMATCH: {summary_detail} Requires human verification due to suspicious review pattern."
            elif final_score >= config.publish_threshold:
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = f"⚠️ CONFLICT: {summary_detail} Despite adjusted score, manual verification required."
            elif final_score >= config.manual_review_threshold:
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = f"⚠️ MISALIGNED: {summary_detail} Text and rating don't match."
            else:
                decision = ReviewStatus.REJECTED
                reason = f"❌ UNRELIABLE: {summary_detail} Mismatch combined with low score indicates fraudulent or careless review."
        elif image_findings or video_findings:
            # Media findings without text mismatch
            if final_score >= config.publish_threshold:
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = "High confidence review has media findings and requires manual review."
            elif final_score >= config.manual_review_threshold:
                decision = ReviewStatus.PENDING_MANUAL_REVIEW
                reason = "Mixed evidence with media findings."
            else:
                decision = ReviewStatus.REJECTED
                reason = "Low score with negative media findings."
        elif final_score >= config.publish_threshold and config.auto_publish_enabled:
            # No conflicts, high score, auto-publish
            decision = ReviewStatus.PUBLISHED
            reason = "Review meets auto-publish threshold with consistent text-rating-media alignment."
        elif final_score >= config.manual_review_threshold:
            # No conflicts, medium score
            decision = ReviewStatus.PENDING_MANUAL_REVIEW
            reason = "Review is acceptable but does not meet auto-publish threshold."
        else:
            # Low score, no special conditions
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
                "context": summary_detail,
                "base_score": base_score if has_mismatch else final_score,
                "final_score": final_score,
                "mismatch_detected": has_mismatch,
                "mismatch_severity": float(mismatch_severity) if has_mismatch else 0.0,
                "top_aspects": text_analysis.aspect_json,
            },
        )
