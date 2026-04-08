# Review Moderation Platform

## Purpose

This feature introduces a centralized review moderation workflow for a marketplace-style platform with:

- One `Super Admin`
- Many `Sellers`
- A shared customer review ingestion pipeline
- Controlled publication to the main website

The goal is to ensure that seller-published reviews are not sent directly to the public website without analysis. Instead, they move through a moderation pipeline that scores sentiment and risk by segment, then either auto-publishes, routes to manual review, or blocks publication.

## Core Workflow

1. A seller receives or publishes a review in their portal.
2. The review enters the moderation pipeline.
3. The pipeline performs segment analysis across dimensions such as:
   - Product quality
   - Delivery
   - Service
   - Returns
   - Website experience
   - Complaints
4. The pipeline assigns:
   - A `pipeline score`
   - A `sentiment score`
   - Segment-level insights
   - A recommended status
5. Based on the configured threshold:
   - Reviews above threshold are auto-published to the main website
   - Reviews near threshold are held for manual review
   - Reviews below threshold are blocked
6. The super admin can override any decision.
7. The super admin can also turn the automation process on or off globally.

## Key Roles

### Super Admin

The super admin owns governance of review publishing across the platform.

Responsibilities:

- View all reviews from all sellers
- Monitor the moderation pipeline
- Turn auto-publish moderation on or off
- Configure or observe the scoring threshold
- Review flagged reviews
- Override publish decisions manually
- Bulk publish, hold, or delete reviews
- Track seller-level health and risk

### Seller

A seller has visibility only into their own review ecosystem.

Responsibilities:

- View reviews related only to their own products
- See which reviews are published, held, or blocked
- Understand customer sentiment trends
- Review category-level performance and graph-based insights
- Detect what customers are happy or unhappy about

## Decision Logic

### Automation enabled

When automation is enabled:

- Seller-published reviews go into the analysis pipeline automatically
- Reviews with score >= threshold are published to the website
- Reviews in the middle band are routed to manual review
- Reviews well below threshold are blocked from publication

### Automation disabled

When automation is disabled:

- No review is auto-published
- Seller-published reviews are always routed to the super admin queue
- The super admin becomes the final decision maker for every review

## Recommended Status Definitions

- `approved`
  - Review is safe to publish
  - Review can appear on the main website

- `manual-review`
  - Review is mixed, sensitive, or ambiguous
  - Requires super admin review before publication

- `blocked`
  - Review indicates high risk, strong dissatisfaction, abuse, or content that should not be auto-published
  - Stays off the public website unless overridden

- `pending`
  - Review entered the system but has not been fully analyzed yet

## Dashboard Requirements

## 1. Super Admin Dashboard

This is the global review governance dashboard.

Main sections:

- `Pipeline control header`
  - Automation on/off toggle
  - Threshold visibility
  - Global counters

- `Moderation KPI cards`
  - Total reviews
  - Auto-approved reviews
  - Manual review queue count
  - Blocked reviews

- `Pipeline workflow panel`
  - Seller publish
  - Segment analysis
  - Threshold decision
  - Super admin override

- `Attention queue`
  - Reviews in manual review
  - Blocked reviews
  - Lowest-scoring items

- `All reviews section`
  - Every review across every seller
  - Filters by category, publish state, and rating
  - Search by seller, product, or customer
  - Review cards with:
    - Seller name
    - Product name
    - Pipeline score
    - Status
    - Segment insights

## 2. Seller Dashboard

This is the seller-facing review analytics portal.

Main sections:

- `Seller selector or seller context`
  - Shows which seller is currently being viewed in demo mode

- `Seller KPI cards`
  - Total reviews
  - Published reviews
  - Average rating
  - Customer happiness percentage

- `Sentiment breakdown`
  - Happy
  - Mixed
  - Unhappy

- `Trend graph`
  - Monthly satisfaction trend

- `Category analysis`
  - Category-wise rating and mention volume

- `Pipeline insight cards`
  - What customers love
  - What needs work
  - Recommended action

- `Seller reviews section`
  - Reviews for that seller only
  - Publication status
  - Pipeline score
  - Segment analysis

## Data Model Suggestions

Each review should support these additional fields:

- `sellerId`
- `sellerName`
- `productName`
- `pipelineScore`
- `sentimentScore`
- `pipelineStatus`
- `autoPublishEligible`
- `segments[]`

Recommended segment shape:

```ts
{
  segment: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
}
```

## Future Backend / Pipeline Notes

When connected to backend services later, the system can be separated into these services:

- `Review ingestion service`
- `Moderation pipeline service`
- `Sentiment and segment analysis service`
- `Publication decision service`
- `Admin override service`
- `Seller analytics service`

Possible persistence tables:

- `reviews`
- `review_segments`
- `review_pipeline_decisions`
- `seller_review_analytics`
- `moderation_settings`

## Demo Scope Implemented In Frontend

The current frontend demo now represents:

- A `Super Admin` dashboard for all reviews
- A `Seller` dashboard for owned reviews only
- A pipeline automation toggle
- Review scoring and moderation status
- Seller-level analytics with charts and insight cards
- Local dummy data only, with no live API dependency

## Next Build Steps

Recommended next implementation steps:

1. Add route-level separation for `/admin/reviews` and `/seller/reviews`
2. Replace dummy data with role-aware backend APIs
3. Persist moderation settings and threshold configuration
4. Integrate real NLP-based sentiment and segment analysis
5. Add audit logging for every super admin override
6. Add seller export and report download features
