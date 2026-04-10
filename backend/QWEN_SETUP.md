# Qwen 1.5B Setup Guide

This backend now uses Qwen 1.5B lightweight language model via Ollama for advanced text analysis instead of basic keyword matching.

## Prerequisites

- **Ollama**: Download from https://ollama.ai
- **Python 3.9+** (already required for the backend)
- **~1-2 GB disk space** for the Qwen 1.5B model

## Setup Steps

### 1. Install Ollama

Download and install Ollama from: https://ollama.ai

Ollama runs as a service in the background and provides a local API endpoint (default: `http://localhost:11434`).

### 2. Pull the Qwen Model

Once Ollama is installed, pull the Qwen 1.5B model:

```bash
ollama pull qwen2:1.5b
```

This will download ~1GB of model weights. You only need to do this once.

### 3. Verify Ollama is Running

Check that Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

You should see the `qwen2:1.5b` model listed in the response.

### 4. Install Python Dependencies

```bash
cd /c/Desktop/review/backend
pip install -r requirements.txt
```

This installs the `ollama` Python client library.

### 5. Start the Backend

```bash
python -m uvicorn app.main:app --reload --port 4500
```

The backend will automatically use Qwen for text analysis when reviews are submitted.

## Configuration

You can customize Ollama settings via environment variables:

### `.env` file (in backend directory):

```env
REVIEW_OLLAMA_HOST=http://localhost:11434
REVIEW_OLLAMA_MODEL=qwen2:1.5b
```

### Environment Variables:

```bash
export REVIEW_OLLAMA_HOST=http://localhost:11434
export REVIEW_OLLAMA_MODEL=qwen2:1.5b
```

## How It Works

When a review is submitted:

1. **Sentiment Analysis**: Qwen analyzes the title + description for sentiment (positive/mixed/negative)
2. **Toxicity Detection**: Detects toxic language and assigns a toxicity score
3. **Spam Detection**: Identifies spam patterns and assigns a spam score
4. **Aspect Analysis**: Extracts product aspects (quality, delivery, service, price, packaging)

The results are combined with star rating and media analysis to calculate the final **pipeline score**.

### Analysis Output Example:

```json
{
  "sentiment": "positive",
  "sentiment_score": 0.85,
  "toxicity_score": 0.05,
  "spam_score": 0.02,
  "summary": "Customer is very satisfied with product quality and fast delivery",
  "aspects": [
    {
      "aspect": "product_quality",
      "sentiment": "positive",
      "score": 0.9
    },
    {
      "aspect": "delivery",
      "sentiment": "positive",
      "score": 0.8
    }
  ]
}
```

## Fallback Behavior

If Ollama is unavailable or the model fails to respond:

- The service automatically falls back to **basic keyword analysis**
- Reviews will still be processed with lower confidence scores (0.65 vs 0.92)
- No errors are thrown; the system continues functioning

## Performance

- **Model Size**: ~1.5B parameters
- **Memory Usage**: ~3-4GB RAM while running
- **Response Time**: 2-5 seconds per review (depends on text length)
- **Accuracy**: Significantly better than keyword matching

## Troubleshooting

### Ollama not found

```bash
# Make sure Ollama service is running
# On Windows: Check taskbar/Services
# On macOS: Check Applications/Ollama
# On Linux: sudo systemctl status ollama
```

### Model not downloaded

```bash
ollama pull qwen2:1.5b
```

### Connection refused error

Ensure Ollama is running and listening on the configured host:

```bash
curl http://localhost:11434/api/tags
```

### Slow responses

- Qwen 1.5B requires ~2-3GB RAM
- If using CPU only: expect 2-5 second responses per review
- For faster responses: use GPU (CUDA/Metal support in Ollama)
- Or use smaller model: `qwen2:0.5b` (faster but less accurate)

## Alternative Models

You can switch to other lightweight models by changing the `REVIEW_OLLAMA_MODEL` environment variable:

- **qwen2:0.5b** - Ultra-lightweight, ~200MB (faster, less accurate)
- **qwen2:1.5b** - Balanced (recommended)
- **qwen2:7b** - Higher accuracy but requires more resources
- **phi:latest** - Alternative lightweight model
- **mistral:latest** - Alternative model

## Disabling Qwen

To revert to basic keyword analysis (not recommended):

1. Change `deps.py` to use `TextAnalysisService()` instead of `OllamaTextAnalysisService()`
2. Uninstall Ollama (optional)

## Monitoring

To check if Qwen is being used:

1. Submit a review
2. Check backend logs for `"confidence_score": 0.92` (Qwen) vs `0.65` (fallback)
3. The analysis response will include more detailed aspects and accurate sentiment

## Next Steps

- Monitor review processing to validate accuracy improvements
- Adjust moderation thresholds based on Qwen's more accurate scoring
- Consider using GPU acceleration if processing many reviews
