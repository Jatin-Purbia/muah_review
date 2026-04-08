from statistics import mean

from app.models.domain import Review, ReviewImageAnalysis, ReviewMedia, ReviewTextAnalysis, ReviewVideoAnalysis


class TextAnalysisService:
    # TODO: Replace heuristic scoring with a real LLM/NLP moderation provider.
    POSITIVE_TERMS = {"good", "great", "love", "excellent", "amazing", "fast", "happy"}
    NEGATIVE_TERMS = {"bad", "poor", "broken", "fake", "hate", "slow", "damaged", "wrong"}
    TOXIC_TERMS = {"idiot", "stupid", "hate"}
    SPAM_TERMS = {"buy now", "discount", "promo"}

    def analyze(self, review: Review) -> ReviewTextAnalysis:
        text = review.text.lower()
        positive_hits = sum(1 for word in self.POSITIVE_TERMS if word in text)
        negative_hits = sum(1 for word in self.NEGATIVE_TERMS if word in text)
        toxicity_hits = sum(1 for word in self.TOXIC_TERMS if word in text)
        spam_hits = sum(1 for word in self.SPAM_TERMS if word in text)
        sentiment_score = max(0.0, min(1.0, 0.5 + ((positive_hits - negative_hits) * 0.12)))
        sentiment = "positive" if sentiment_score >= 0.65 else "negative" if sentiment_score <= 0.35 else "mixed"

        aspects = [
            {"aspect": "product_quality", "sentiment": sentiment, "score": round(sentiment_score, 2)},
            {"aspect": "delivery", "sentiment": "positive" if "deliver" in text or "shipping" in text else "neutral", "score": 0.7 if "deliver" in text or "shipping" in text else 0.5},
            {"aspect": "service", "sentiment": "positive" if "support" in text or "service" in text else "neutral", "score": 0.72 if "support" in text or "service" in text else 0.5},
        ]
        return ReviewTextAnalysis(
            review_id=review.id,
            overall_sentiment=sentiment,
            overall_score=round(sentiment_score, 2),
            spam_score=min(1.0, spam_hits * 0.35),
            toxicity_score=min(1.0, toxicity_hits * 0.45),
            confidence_score=0.82,
            aspect_json=aspects,
            summary=f"Text sentiment is {sentiment} with {positive_hits} positive and {negative_hits} negative cues.",
        )


class RatingAnalysisService:
    def normalize(self, star_rating: int) -> float:
        return round((star_rating - 1) / 4, 2)

    def detect_mismatch(self, star_rating: int, text_score: float, media_score: float | None = None) -> dict:
        rating_score = self.normalize(star_rating)
        signals = [text_score]
        if media_score is not None:
            signals.append(media_score)
        evidence_score = mean(signals)
        delta = abs(rating_score - evidence_score)
        return {
            "rating_score": rating_score,
            "evidence_score": round(evidence_score, 2),
            "delta": round(delta, 2),
            "mismatch": delta >= 0.35,
        }


class ImageAnalysisService:
    def analyze(self, media: ReviewMedia) -> ReviewImageAnalysis:
        # TODO: Plug OCR, relevance classification, and defect detection here.
        findings: list[dict] = []
        url = media.media_url.lower()
        if "damage" in url or "broken" in url:
            findings.append({"issue": "visible_damage", "severity": "high"})
        if "invoice" in url or "label" in url:
            findings.append({"issue": "ocr_relevant", "severity": "low"})
        return ReviewImageAnalysis(
            review_media_id=media.id,
            relevance_score=0.88,
            ocr_text="Detected package label" if "label" in url else None,
            findings_json=findings,
            confidence_score=0.79,
        )


class VideoAnalysisService:
    def analyze(self, media: ReviewMedia) -> ReviewVideoAnalysis:
        # TODO: Plug frame extraction, ASR, and multimodal reasoning here.
        url = media.media_url.lower()
        transcript = "Customer describes the product and highlights the experience."
        findings = []
        if "damage" in url or "complaint" in url:
            findings.append({"issue": "visible_issue_in_keyframes", "severity": "medium"})
            transcript = "Customer reports a complaint and shows the issue on camera."
        return ReviewVideoAnalysis(
            review_media_id=media.id,
            transcript=transcript,
            transcript_sentiment="negative" if findings else "positive",
            keyframe_findings_json=findings,
            ocr_text=None,
            confidence_score=0.76,
        )


class MediaScoringService:
    def score(self, image_analyses: list[ReviewImageAnalysis], video_analyses: list[ReviewVideoAnalysis]) -> float:
        media_signals: list[float] = []
        for item in image_analyses:
            media_signals.append(max(0.0, item.relevance_score - (0.2 * len(item.findings_json))))
        for item in video_analyses:
            media_signals.append(0.8 if item.transcript_sentiment == "positive" else 0.35)
        return round(mean(media_signals), 2) if media_signals else 0.6
