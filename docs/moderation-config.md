# Moderation Config

The fusion layer's behavior is driven by a single `ModerationConfig` record. Operators tune it via `PATCH /api/admin/moderation-config`; the values are read on every `process_review` call so changes apply to **future** reviews — already-decided reviews are not re-evaluated.

## The fields

| Field | Type | Default | What it does |
| --- | --- | --- | --- |
| `pipeline_enabled` | bool | `true` | Master kill switch. When `false`, every review is routed straight to `pending_manual_review` with `final_score = 0.0`. |
| `auto_publish_enabled` | bool | `true` | When `false`, a clean review whose score clears `publish_threshold` is held at `pending_manual_review` instead of being auto-published. |
| `publish_threshold` | float `[0,1]` | `0.75` | Minimum `final_score` required to auto-publish a clean review. |
| `manual_review_threshold` | float `[0,1]` | `0.45` | Floor below which a clean review is `rejected` outright. Between this and `publish_threshold` → `pending_manual_review`. |
| `toxicity_threshold` | float `[0,1]` | `0.8` | If `text_analysis.toxicity_score >= this`, the review is short-circuited to `flagged`. |
| `spam_threshold` | float `[0,1]` | `0.85` | If `text_analysis.spam_score >= this`, the review is short-circuited to `rejected`. |

Defaults are also baked into the `Settings` loader at [backend/app/core/config.py](../backend/app/core/config.py) and seeded into the repository on startup. Persisted overrides win over the env-derived defaults.

## How the thresholds compose

Below is the effective decision tree, simplified — see [pipeline.md](pipeline.md) for the long form.

```
if not pipeline_enabled        -> pending_manual_review
elif toxicity >= toxicity_thr  -> flagged
elif spam >= spam_thr          -> rejected
elif rating mismatch (delta>=.35):
        if delta >= 0.50       -> pending_manual_review (severe)
        elif score >= publish  -> pending_manual_review (downgraded)
        elif score >= manual   -> pending_manual_review
        else                   -> rejected (unreliable)
elif media findings present    -> pending_manual_review     (currently unreachable)
elif score >= publish AND auto_publish -> published
elif score >= manual           -> pending_manual_review
else                           -> rejected
```

`score` here is the post-mismatch-penalty `final_score`. Composition: `final_score = clamp(0,1, content*0.8 + safety*0.2 - mismatch_penalty)`, with `content = text*0.7 + media*0.3` and `safety = 1 - (toxicity*0.6 + spam*0.4)`.

## Recipes

### Halt all automation (super admin reviews everything)

```bash
curl -X PATCH http://localhost:4500/api/admin/moderation-config \
  -H 'Content-Type: application/json' \
  -d '{ "pipeline_enabled": false }'
```

Every new review → `pending_manual_review`, `final_score = 0`. Re-enable by patching it back to `true`.

### Keep automation on but stop auto-publishing

```bash
curl -X PATCH http://localhost:4500/api/admin/moderation-config \
  -H 'Content-Type: application/json' \
  -d '{ "auto_publish_enabled": false }'
```

Reviews still get scored and bucketed, but high scorers wait in `pending_manual_review` instead of going live.

### Tighten or loosen the publish bar

```bash
# Stricter — only very confident reviews auto-publish
curl -X PATCH http://localhost:4500/api/admin/moderation-config \
  -d '{ "publish_threshold": 0.85 }' -H 'Content-Type: application/json'

# Looser — let medium-confidence through
curl -X PATCH http://localhost:4500/api/admin/moderation-config \
  -d '{ "publish_threshold": 0.65 }' -H 'Content-Type: application/json'
```

### Be more aggressive on toxicity / spam

```bash
curl -X PATCH http://localhost:4500/api/admin/moderation-config \
  -d '{ "toxicity_threshold": 0.5, "spam_threshold": 0.6 }' \
  -H 'Content-Type: application/json'
```

Lower thresholds = more flags / rejections. The text scorer multiplies hits, so even with Qwen the values tend to cluster low for normal reviews.

### Reset to defaults

There is no "reset" endpoint. Patch each field to its default value above.

## Env-var seed values

When the repo first comes up, the config it seeds comes from these `Settings` (prefix `REVIEW_`):

```
REVIEW_MODERATION_AUTO_PUBLISH_ENABLED=true
REVIEW_MODERATION_PIPELINE_ENABLED=true
REVIEW_MODERATION_PUBLISH_THRESHOLD=0.75
REVIEW_MODERATION_MANUAL_REVIEW_THRESHOLD=0.45
REVIEW_MODERATION_TOXICITY_THRESHOLD=0.8
REVIEW_MODERATION_SPAM_THRESHOLD=0.85
```

Set them in `backend/.env` before first start to change defaults. After that, persistence wins — change values via the API.

## Tuning notes

- The text scorer biases positive sentiment via short-text bonuses (see `_score_text` in [services/analysis.py](../backend/app/services/analysis.py)). Most short genuine reviews land in `0.65–0.85`, which means the default `publish_threshold = 0.75` is the sensitive knob.
- The mismatch detector triggers at `delta >= 0.35`. With `media_score = 0.6` and a positive text (`~0.8`), a 1-star rating yields `delta ≈ 0.4` → mismatch. That's intentional: low star + glowing text is treated as suspicious.
- A `severe` mismatch (`delta >= 0.50`) **always** lands in manual review regardless of any other score. There is no toggle for this.
- `image_findings` and `video_findings` are always empty today, so the "media findings" branch in fusion is dormant. Wiring real image/video analysis (see [pipeline.md](pipeline.md) "Open / mocked parts") will activate it.
