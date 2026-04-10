#!/usr/bin/env python3
"""Test script to verify Qwen analysis is working"""

import json
from app.models.domain import Review
from app.services.analysis import OllamaTextAnalysisService

# Create a test review
test_review = Review(
    id="test-001",
    user_id="user123",
    seller_id="seller456",
    product_id="product789",
    title="Amazing product quality!",
    description="This product exceeded my expectations. Fast delivery and excellent customer service. Very satisfied!",
    star_rating=5,
)

# Initialize the Qwen service
service = OllamaTextAnalysisService(model="qwen2:1.5b", ollama_host="http://localhost:11434")

print("🧠 Testing Qwen 1.5B Analysis Service")
print("=" * 60)
print(f"\n📝 Review:")
print(f"  Title: {test_review.title}")
print(f"  Description: {test_review.description}")
print(f"  Rating: {test_review.star_rating}/5")

print(f"\n⏳ Analyzing with Qwen (this may take 2-5 seconds)...")

try:
    result = service.analyze(test_review)

    print("\n✅ Analysis Complete!")
    print("=" * 60)
    print(f"\n📊 Results:")
    print(f"  Sentiment: {result.overall_sentiment.upper()}")
    print(f"  Sentiment Score: {result.overall_score}")
    print(f"  Toxicity Score: {result.toxicity_score}")
    print(f"  Spam Score: {result.spam_score}")
    print(f"  Confidence: {result.confidence_score}")
    print(f"  Summary: {result.summary}")

    print(f"\n🏷️ Detected Aspects:")
    for aspect in result.aspect_json:
        print(f"  - {aspect['aspect']}: {aspect['sentiment']} (score: {aspect['score']})")

    print("\n" + "=" * 60)
    print("✓ Qwen is working correctly!")

except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nMake sure:")
    print("  1. Ollama is running: ollama serve")
    print("  2. Qwen model is downloaded: ollama pull qwen2:1.5b")
    print("  3. Backend dependencies are installed: pip install -r requirements.txt")
