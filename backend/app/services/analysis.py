import json
import re
from statistics import mean
from typing import Literal

from pydantic import BaseModel, ValidationError

try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

from app.models.domain import Review, ReviewImageAnalysis, ReviewMedia, ReviewTextAnalysis, ReviewVideoAnalysis


class SentimentPayload(BaseModel):
    sentiment: Literal["positive", "mixed", "negative"]
    sentiment_score: float
    toxicity_score: float
    spam_score: float
    summary: str


class AspectPayloadItem(BaseModel):
    aspect: str
    sentiment: Literal["positive", "neutral", "negative"]
    score: float


class AspectPayload(BaseModel):
    aspects: list[AspectPayloadItem]


class TextAnalysisService:
    # TODO: Replace heuristic scoring with a real LLM/NLP moderation provider.
    POSITIVE_TERMS = {"good", "great", "love", "excellent", "amazing", "fast", "happy"}
    NEGATIVE_TERMS = {"bad", "poor", "broken", "fake", "hate", "slow", "damaged", "wrong"}
    TOXIC_TERMS = {"idiot", "stupid", "hate"}
    SPAM_TERMS = {"buy now", "discount", "promo"}

    @classmethod
    def _tokenize(cls, text: str) -> list[str]:
        return re.findall(r"[a-z']+", text.lower())

    @classmethod
    def _score_text(cls, text: str) -> tuple[float, str, int, int]:
        tokens = cls._tokenize(text)
        joined = " ".join(tokens)

        positive_hits = sum(1 for word in cls.POSITIVE_TERMS if word in joined)
        negative_hits = sum(1 for word in cls.NEGATIVE_TERMS if word in joined)

        sentiment_score = 0.5 + ((positive_hits - negative_hits) * 0.16)

        # Reward concise, opinionated text so genuine short reviews are not treated as neutral.
        if len(tokens) >= 3 and positive_hits > 0 and negative_hits == 0:
            sentiment_score += 0.1
        if len(tokens) >= 5 and (positive_hits + negative_hits) > 0:
            sentiment_score += 0.05

        sentiment_score = max(0.0, min(1.0, sentiment_score))
        sentiment = "positive" if sentiment_score >= 0.62 else "negative" if sentiment_score <= 0.38 else "mixed"
        return round(sentiment_score, 2), sentiment, positive_hits, negative_hits

    def analyze(self, review: Review) -> ReviewTextAnalysis:
        # Analyze title + description
        text = (review.title + " " + review.description).lower()
        sentiment_score, sentiment, positive_hits, negative_hits = self._score_text(text)
        toxicity_hits = sum(1 for word in self.TOXIC_TERMS if word in text)
        spam_hits = sum(1 for word in self.SPAM_TERMS if word in text)

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
            analysis_mode="heuristic",
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


class OllamaTextAnalysisService:
    """Text analysis using Qwen model via Ollama for superior NLP capabilities."""

    def __init__(self, model: str = "qwen2:1.5b", ollama_host: str = "http://localhost:11434"):
        self.model = model
        self.ollama_host = ollama_host
        if OLLAMA_AVAILABLE:
            self.client = ollama.Client(host=ollama_host)
        else:
            self.client = None

    def _query_model(self, prompt: str) -> str:
        """Query Qwen model via Ollama."""
        if not self.client:
            raise RuntimeError("Ollama client not available. Install ollama package.")

        response = self.client.generate(
            model=self.model,
            prompt=prompt,
            stream=False,
            options={"temperature": 0.3, "num_predict": 256}
        )
        return response.get("response", "").strip()

    @staticmethod
    def _extract_json_object(raw: str) -> str:
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Model response did not contain a JSON object.")
        return raw[start:end + 1]

    def analyze(self, review: Review) -> ReviewTextAnalysis:
        """Analyze review using Qwen model for sentiment, toxicity, spam, and aspects."""
        text = f"{review.title} {review.description}"

        if not self.client:
            # Fallback to basic analysis if Ollama unavailable
            return self._fallback_analysis(review, reason="llm_unavailable")

        # Analyze sentiment and toxicity
        sentiment_prompt = f"""Analyze this review and respond in JSON format:
Review: "{text}"

Respond ONLY with valid JSON (no markdown, no explanation):
{{
  "sentiment": "positive|mixed|negative",
  "sentiment_score": 0.0-1.0,
  "toxicity_score": 0.0-1.0,
  "spam_score": 0.0-1.0,
  "summary": "brief summary"
}}"""

        try:
            response = self._query_model(sentiment_prompt)
            analysis_data = SentimentPayload.model_validate_json(self._extract_json_object(response))
        except (ValidationError, ValueError, RuntimeError):
            return self._fallback_analysis(review, reason="llm_sentiment_parse_failed")

        # Analyze aspects
        aspects_prompt = f"""Identify product/service aspects mentioned in this review:
Review: "{text}"

Respond ONLY with valid JSON (no markdown):
{{
  "aspects": [
    {{"aspect": "product_quality|delivery|service|price|packaging", "sentiment": "positive|neutral|negative", "score": 0.0-1.0}},
    ...
  ]
}}"""

        try:
            aspects_response = self._query_model(aspects_prompt)
            aspects_data = AspectPayload.model_validate_json(self._extract_json_object(aspects_response))
            aspects = [item.model_dump() for item in aspects_data.aspects]
        except (ValidationError, ValueError, RuntimeError):
            aspects = []

        # Ensure we have at least default aspects
        if not aspects:
            aspects = [
                {"aspect": "product_quality", "sentiment": analysis_data.sentiment, "score": analysis_data.sentiment_score},
                {"aspect": "delivery", "sentiment": "neutral", "score": 0.5},
                {"aspect": "service", "sentiment": "neutral", "score": 0.5},
            ]

        return ReviewTextAnalysis(
            review_id=review.id,
            overall_sentiment=analysis_data.sentiment,
            overall_score=round(max(0.0, min(1.0, analysis_data.sentiment_score)), 2),
            spam_score=round(max(0.0, min(1.0, analysis_data.spam_score)), 2),
            toxicity_score=round(max(0.0, min(1.0, analysis_data.toxicity_score)), 2),
            confidence_score=0.92,  # Qwen-based analysis has higher confidence
            aspect_json=aspects,
            summary=analysis_data.summary,
            analysis_mode="llm",
        )

    def _fallback_analysis(self, review: Review, reason: str = "llm_unavailable") -> ReviewTextAnalysis:
        """Fallback to basic keyword analysis if Ollama unavailable."""
        text = (review.title + " " + review.description).lower()
        sentiment_score, sentiment, _, _ = TextAnalysisService._score_text(text)
        toxic_keywords = {"idiot", "stupid", "hate"}
        spam_keywords = {"buy now", "discount", "promo"}

        return ReviewTextAnalysis(
            review_id=review.id,
            overall_sentiment=sentiment,
            overall_score=round(sentiment_score, 2),
            spam_score=min(1.0, sum(1 for word in spam_keywords if word in text) * 0.35),
            toxicity_score=min(1.0, sum(1 for word in toxic_keywords if word in text) * 0.45),
            confidence_score=0.65,  # Lower confidence for fallback
            aspect_json=[
                {"aspect": "product_quality", "sentiment": sentiment, "score": round(sentiment_score, 2)},
                {"aspect": "delivery", "sentiment": "neutral", "score": 0.5},
                {"aspect": "service", "sentiment": "neutral", "score": 0.5},
            ],
            summary=f"Fallback analysis: {sentiment} sentiment detected.",
            analysis_mode="fallback",
            analysis_error=reason,
        )
