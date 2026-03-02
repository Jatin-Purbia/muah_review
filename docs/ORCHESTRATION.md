# System Orchestration Guide

## 📖 Overview

This document provides a comprehensive explanation of how the Enterprise Review Management System orchestrates data flow, service interactions, and decision-making processes across all system components. Understanding this orchestration is crucial for system maintenance, debugging, and future enhancements.

---

## 🎭 Table of Contents

1. [Orchestration Layers](#orchestration-layers)
2. [Request Lifecycle](#request-lifecycle)
3. [Service Interactions](#service-interactions)
4. [Event-Driven Processing](#event-driven-processing)
5. [Decision Flow Logic](#decision-flow-logic)
6. [Error Handling & Recovery](#error-handling--recovery)
7. [Monitoring & Observability Flow](#monitoring--observability-flow)
8. [Data Consistency Patterns](#data-consistency-patterns)
9. [Scaling & Load Management](#scaling--load-management)

---

## 🏛️ Orchestration Layers

The system operates across **5 distinct orchestration layers**, each with specific responsibilities:

### Layer 1: Security & Traffic Management
```
┌─────────────────────────────────────────────────────────────┐
│  External Request → WAF → Load Balancer → API Gateway       │
│                                                              │
│  Responsibilities:                                           │
│  • DDoS protection and malicious traffic filtering          │
│  • SSL/TLS termination and certificate management           │
│  • Traffic distribution across service replicas             │
│  • Rate limiting (1000 req/min per IP)                      │
│  • API versioning and routing (/api/v1, /api/v2)           │
└─────────────────────────────────────────────────────────────┘
```

### Layer 2: Authentication & Authorization
```
┌─────────────────────────────────────────────────────────────┐
│  API Gateway → Keycloak Auth Service → Service Endpoints    │
│                                                              │
│  Responsibilities:                                           │
│  • OAuth 2.0 / OIDC token validation                        │
│  • JWT token generation and refresh                         │
│  • Multi-factor authentication enforcement                  │
│  • Role-based access control (RBAC)                         │
│  • Session management (30-minute timeout)                   │
└─────────────────────────────────────────────────────────────┘
```

### Layer 3: Data Ingestion & Queueing
```
┌─────────────────────────────────────────────────────────────┐
│  Service Endpoints → Kafka Topic → Consumer Groups          │
│                                                              │
│  Responsibilities:                                           │
│  • Accept review data from multiple sources                 │
│  • Validate input data schema                               │
│  • Publish to Kafka 'raw-reviews' topic                     │
│  • Handle backpressure with queue buffering                 │
│  • Ensure at-least-once delivery guarantee                  │
└─────────────────────────────────────────────────────────────┘
```

### Layer 4: Processing & Intelligence
```
┌─────────────────────────────────────────────────────────────┐
│  Consumers → Preprocessor → AI Models → Logic Gate          │
│                                                              │
│  Responsibilities:                                           │
│  • Clean and normalize text data                            │
│  • Sentiment analysis using DistilBERT                      │
│  • Fact verification using GPT-4                            │
│  • Auto-publish decision based on business rules            │
│  • Generate embeddings for semantic search                  │
└─────────────────────────────────────────────────────────────┘
```

### Layer 5: Storage & Analysis
```
┌─────────────────────────────────────────────────────────────┐
│  Processed Data → PostgreSQL / Astra / Redis / S3           │
│                  → LangChain → RAG Engine → Insights        │
│                                                              │
│  Responsibilities:                                           │
│  • Persist structured and vector data                       │
│  • Cache frequently accessed data                           │
│  • Archive historical data for compliance                   │
│  • Generate business insights and recommendations           │
│  • Power user-facing dashboards                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Request Lifecycle

### 1️⃣ HTTP API Request Flow

When a client submits a review via REST API, the following orchestration occurs:

```
┌─────────────┐
│  1. CLIENT  │
│   SUBMITS   │
│   REVIEW    │
└──────┬──────┘
       │ HTTPS POST /api/v1/reviews
       │ {rating: 5, text: "Great!", product_id: "ABC"}
       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. WAF INSPECTION                                          │
│  ────────────────────────────────────────────────────────── │
│  ✓ Check OWASP rules (SQL injection, XSS)                  │
│  ✓ Verify request rate < 1000/min                          │
│  ✓ Scan for malicious patterns                             │
│  ✓ GeoIP filtering (if configured)                         │
│                                                             │
│  ⚠️  REJECT if malicious → Return 403 Forbidden            │
│  ✓  ACCEPT if clean → Forward to Load Balancer             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. LOAD BALANCER DISTRIBUTION                              │
│  ────────────────────────────────────────────────────────── │
│  • Select healthy API service replica (round-robin)         │
│  • Check /health endpoint (last 10 seconds)                 │
│  • Terminate SSL/TLS connection                             │
│  • Add X-Forwarded-For header                               │
│                                                             │
│  Available Replicas: [API-1, API-2, API-3]                 │
│  Selected: API-2 (lowest current load)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. API GATEWAY PROCESSING                                  │
│  ────────────────────────────────────────────────────────── │
│  • Route to /api/v1/reviews endpoint                        │
│  • Apply rate limiting (per-user quotas)                    │
│  • Transform request (normalize headers)                    │
│  • Add correlation ID for tracing                           │
│  • Check circuit breaker state (closed/open)                │
│                                                             │
│  Correlation-ID: req-abc123-xyz789                          │
│  Circuit Breaker: CLOSED (healthy)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  5. AUTHENTICATION CHECK                                    │
│  ────────────────────────────────────────────────────────── │
│  • Extract Bearer token from Authorization header           │
│  • Validate JWT signature with Keycloak                     │
│  • Check token expiration (max 1 hour)                      │
│  • Verify required scope: 'reviews:write'                   │
│  • Check user session status                                │
│                                                             │
│  ⚠️  REJECT if invalid → Return 401 Unauthorized            │
│  ✓  ACCEPT if valid → Extract user context                 │
│                                                             │
│  User Context: {id: "user-456", role: "seller"}             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  6. API SERVICE PROCESSING                                  │
│  ────────────────────────────────────────────────────────── │
│  • Validate request schema (Joi/Zod)                        │
│  • Check required fields: rating, text, product_id          │
│  • Validate data types and constraints                      │
│  • Generate unique review ID                                │
│  • Enrich with metadata (timestamp, IP, user agent)         │
│                                                             │
│  ⚠️  REJECT if invalid → Return 400 Bad Request             │
│  ✓  ACCEPT if valid → Prepare for Kafka                    │
│                                                             │
│  Enriched Payload:                                          │
│  {                                                          │
│    review_id: "rev-789012",                                 │
│    rating: 5,                                               │
│    text: "Great!",                                          │
│    product_id: "ABC",                                       │
│    user_id: "user-456",                                     │
│    timestamp: "2026-03-02T10:30:00Z",                       │
│    source: "api",                                           │
│    ip: "192.168.1.100"                                      │
│  }                                                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  7. KAFKA PUBLICATION                                       │
│  ────────────────────────────────────────────────────────── │
│  • Select partition by product_id hash (consistent)         │
│  • Serialize to JSON                                        │
│  • Set message key: product_id                              │
│  • Publish to 'raw-reviews' topic                           │
│  • Wait for broker acknowledgment (acks=all)                │
│                                                             │
│  Topic: raw-reviews                                         │
│  Partition: 7 (hash(ABC) % 12)                              │
│  Offset: 1234567                                            │
│  Replication: 3 brokers confirmed                           │
│                                                             │
│  ✓ Message persisted successfully                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  8. API RESPONSE                                            │
│  ────────────────────────────────────────────────────────── │
│  HTTP 202 Accepted                                          │
│  {                                                          │
│    "status": "accepted",                                    │
│    "review_id": "rev-789012",                               │
│    "message": "Review queued for processing",               │
│    "estimated_time": "30-60 seconds"                        │
│  }                                                          │
│                                                             │
│  • Log request (Logstash)                                   │
│  • Export metrics (Prometheus)                              │
│  • Send trace span (Jaeger)                                 │
└─────────────────────────────────────────────────────────────┘
```

**Time Breakdown:**
- WAF Inspection: ~5ms
- Load Balancer: ~3ms
- API Gateway: ~8ms
- Authentication: ~15ms
- API Service: ~20ms
- Kafka Publication: ~30ms
- **Total Latency: ~81ms** (p50)

---

### 2️⃣ Webhook Event Flow

For e-commerce platform webhooks (Shopify, WooCommerce):

```
┌─────────────────────────────────────────────────────────────┐
│  SHOPIFY WEBHOOK TRIGGER                                    │
│  ────────────────────────────────────────────────────────── │
│  Event: orders/updated                                      │
│  Trigger: Customer submits product review                   │
│  Destination: https://api.your-domain.com/webhooks/shopify  │
│                                                             │
│  Shopify Signs Request:                                     │
│  X-Shopify-Hmac-SHA256: base64(hmac_sha256(secret, body))  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK RECEIVER SERVICE                                   │
│  ────────────────────────────────────────────────────────── │
│  1. Verify webhook signature (HMAC-SHA256)                  │
│     ⚠️  Invalid signature → Log & Return 403                │
│                                                             │
│  2. Validate event type (orders/updated)                    │
│     ⚠️  Unknown type → Log & Return 400                     │
│                                                             │
│  3. Extract review data from webhook payload                │
│     • Parse nested JSON structure                           │
│     • Map Shopify fields to internal schema                 │
│                                                             │
│  4. Idempotency check (Redis cache)                         │
│     • Check if webhook ID already processed                 │
│     ✓ Duplicate → Return 200 (already processed)            │
│                                                             │
│  5. Publish to Kafka 'raw-reviews' topic                    │
│                                                             │
│  6. Return 200 OK immediately (async processing)            │
│                                                             │
│  Retry Mechanism:                                           │
│  • If Kafka unavailable: Retry 3 times (exp. backoff)      │
│  • If all retries fail: Store in RabbitMQ DLQ               │
└─────────────────────────────────────────────────────────────┘
```

---

### 3️⃣ Batch Processing Flow

For bulk imports from S3 or Kaggle datasets:

```
┌─────────────────────────────────────────────────────────────┐
│  CRON TRIGGER                                               │
│  ────────────────────────────────────────────────────────── │
│  Schedule: */15 * * * * (Every 15 minutes)                  │
│  Job: batch-review-processor                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  BATCH PROCESSOR ORCHESTRATION                              │
│  ────────────────────────────────────────────────────────── │
│  1. List S3 bucket: s3://raw-reviews/pending/               │
│     Available files: reviews_batch_001.csv                  │
│                                                             │
│  2. Download file to local temp directory                   │
│     Size: 50MB (~100,000 reviews)                           │
│                                                             │
│  3. Parse CSV with validation                               │
│     • Skip header row                                       │
│     • Validate each row schema                              │
│     • Log invalid rows to error file                        │
│                                                             │
│  4. Chunk into batches (10,000 records each)                │
│     Batches: 10 chunks                                      │
│                                                             │
│  5. Parallel processing (5 workers)                         │
│     Worker-1: Batch 1-2                                     │
│     Worker-2: Batch 3-4                                     │
│     Worker-3: Batch 5-6                                     │
│     Worker-4: Batch 7-8                                     │
│     Worker-5: Batch 9-10                                    │
│                                                             │
│  6. Each worker publishes to Kafka in bulk                  │
│     • Batch publish (1000 messages per API call)            │
│     • Wait for acknowledgment before next batch             │
│                                                             │
│  7. Archive processed file                                  │
│     Move: s3://raw-reviews/pending/ →                       │
│           s3://raw-reviews/processed/2026-03-02/            │
│                                                             │
│  8. Update processing metrics                               │
│     • Total records: 100,000                                │
│     • Successful: 98,547                                    │
│     • Invalid: 1,453 (logged)                               │
│     • Duration: 4m 23s                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 Service Interactions

### Processing Pipeline Orchestration

Once a review is in Kafka, the processing pipeline takes over:

```
┌────────────────────────────────────────────────────────────────┐
│  KAFKA CONSUMER GROUP: review-processors                       │
│  ────────────────────────────────────────────────────────────  │
│  • 12 consumer instances (one per partition)                   │
│  • Poll interval: 100ms                                        │
│  • Max poll records: 500                                       │
│  • Commit strategy: After successful processing                │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     │ Consumes Message
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 1: TEXT PREPROCESSOR                                     │
│  ──────────────────────────────────────────────────────────    │
│  Input: Raw review text                                        │
│  "This product is AMAZING!!! <3 😍 Best purchase ever!!!"      │
│                                                                │
│  Processing Steps:                                             │
│  1. HTML cleaning: Remove tags, entities                      │
│  2. Emoji handling: Convert to text or remove                 │
│  3. Normalize whitespace: Multiple spaces → single            │
│  4. Case normalization: Convert to lowercase                  │
│  5. Tokenization: Split into words (spaCy)                    │
│  6. Lemmatization: "purchases" → "purchase"                   │
│  7. Stopword removal: Remove "this", "is", etc.               │
│  8. Special char cleaning: Remove excess punctuation          │
│                                                                │
│  Output: Clean text                                           │
│  "product amazing best purchase ever"                         │
│                                                                │
│  Duration: ~50ms per review                                   │
│  Throughput: 20 reviews/second per worker                     │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     │ Parallel Fan-Out
                     ├──────────────────┬────────────────────┐
                     ▼                  ▼                    ▼
┌──────────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  STEP 2A:                │ │  STEP 2B:        │ │  STEP 2C:        │
│  SENTIMENT ANALYSIS      │ │  FACT CHECKING   │ │  EMBEDDING GEN   │
│  ──────────────────────  │ │  ──────────────  │ │  ──────────────  │
│                          │ │                  │ │                  │
│  Model: DistilBERT       │ │  Model: GPT-4    │ │  Model: MiniLM   │
│  Hardware: T4 GPU        │ │  API: OpenAI     │ │  Hardware: CPU   │
│                          │ │                  │ │                  │
│  Process:                │ │  Process:        │ │  Process:        │
│  • Tokenize text         │ │  • Extract facts │ │  • Tokenize      │
│  • Pass to model         │ │  • Query KB      │ │  • Generate      │
│  • Get logits            │ │  • Verify claims │ │    384-dim vec   │
│  • Softmax               │ │  • Score 0-1     │ │  • Normalize     │
│                          │ │                  │ │                  │
│  Input:                  │ │  Input:          │ │  Input:          │
│  "product amazing..."    │ │  "product        │ │  "product        │
│                          │ │   amazing..."    │ │   amazing..."    │
│  Output:                 │ │                  │ │                  │
│  {                       │ │  Output:         │ │  Output:         │
│    sentiment: "positive" │ │  {               │ │  {               │
│    score: 0.94           │ │    confidence:   │ │    vector: [     │
│    confidence: 0.98      │ │      0.85        │ │      0.023,      │
│  }                       │ │    verified:     │ │      -0.145,     │
│                          │ │      true        │ │      ...         │
│  Duration: ~200ms        │ │  }               │ │      0.076       │
│  Batch: 32 reviews       │ │                  │ │    ]             │
│                          │ │  Duration: ~1.2s │ │  }               │
│                          │ │  (API call)      │ │                  │
│                          │ │                  │ │  Duration: ~30ms │
└──────────┬───────────────┘ └────────┬─────────┘ └────────┬─────────┘
           │                          │                     │
           │                          │                     │
           └──────────────┬───────────┘                     │
                          │                                 │
                          ▼                                 │
           ┌──────────────────────────────────┐             │
           │  STEP 3: AUTO-PUBLISH LOGIC      │             │
           │  ──────────────────────────────  │             │
           │                                  │             │
           │  Rule Engine: Drools             │             │
           │                                  │             │
           │  Rules:                          │             │
           │  WHEN                            │             │
           │    sentiment.score >= 0.8        │             │
           │    AND                           │             │
           │    fact.confidence >= 0.7        │             │
           │  THEN                            │             │
           │    decision = "PUBLISH"          │             │
           │  ELSE                            │             │
           │    decision = "REVIEW_QUEUE"     │             │
           │                                  │             │
           │  Current Review:                 │             │
           │    sentiment.score = 0.94 ✓      │             │
           │    fact.confidence = 0.85 ✓      │             │
           │                                  │             │
           │  Decision: PUBLISH               │             │
           │  Duration: ~5ms                  │             │
           └──────────────┬───────────────────┘             │
                          │                                 │
                          ▼                                 │
           ┌──────────────────────────────────┐             │
           │  STEP 4A: POSTGRESQL INSERT      │             │
           │  ──────────────────────────────  │             │
           │                                  │             │
           │  Transaction Begin               │             │
           │                                  │             │
           │  INSERT INTO reviews (           │             │
           │    review_id,                    │             │
           │    text,                         │             │
           │    rating,                       │             │
           │    product_id,                   │             │
           │    user_id,                      │             │
           │    timestamp,                    │             │
           │    status                        │             │
           │  ) VALUES (                      │             │
           │    'rev-789012',                 │             │
           │    'This product is AMAZING...', │             │
           │    5,                            │             │
           │    'ABC',                        │             │
           │    'user-456',                   │             │
           │    '2026-03-02 10:30:00',        │             │
           │    'published'                   │             │
           │  );                              │             │
           │                                  │             │
           │  INSERT INTO sentiment_scores (  │             │
           │    review_id,                    │             │
           │    sentiment,                    │             │
           │    score                         │             │
           │  ) VALUES (                      │             │
           │    'rev-789012',                 │             │
           │    'positive',                   │             │
           │    0.94                          │             │
           │  );                              │             │
           │                                  │             │
           │  Transaction Commit              │             │
           │  Duration: ~15ms                 │             │
           └──────────────────────────────────┘             │
                                                            │
           ┌────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  STEP 4B: ASTRA VECTOR INSERT        │
│  ──────────────────────────────────  │
│                                      │
│  Collection: review_embeddings       │
│                                      │
│  Document:                           │
│  {                                   │
│    "_id": "rev-789012",              │
│    "product_id": "ABC",              │
│    "text": "product amazing...",     │
│    "timestamp": "2026-03-02...",     │
│    "$vector": [                      │
│      0.023, -0.145, ..., 0.076       │
│    ]                                 │
│  }                                   │
│                                      │
│  API: Stargate REST                  │
│  Endpoint: POST /v2/keyspaces/...    │
│  Duration: ~25ms                     │
└──────────────────────────────────────┘
```

**Pipeline Throughput:**
- Single review: ~1.5 seconds end-to-end
- Batch of 32: ~6 seconds (5.3 reviews/second)
- With 12 parallel consumers: **~64 reviews/second**

---

## ⚡ Event-Driven Processing

### Kafka Consumer Group Coordination

```
┌────────────────────────────────────────────────────────────────┐
│  KAFKA TOPIC: raw-reviews                                      │
│  Partitions: 12                                                │
│  Replication Factor: 3                                         │
│                                                                │
│  Consumer Group: review-processors                             │
│  Instances: 12 (optimal: one per partition)                    │
│                                                                │
│  Partition Assignment:                                         │
│  ┌──────────┬──────────────────────┬─────────────────┐        │
│  │Partition │ Consumer Instance    │ Current Offset  │        │
│  ├──────────┼──────────────────────┼─────────────────┤        │
│  │    0     │ processor-01         │   1,234,567     │        │
│  │    1     │ processor-02         │   1,198,432     │        │
│  │    2     │ processor-03         │   1,267,890     │        │
│  │    3     │ processor-04         │   1,223,456     │        │
│  │   ...    │ ...                  │   ...           │        │
│  │   11     │ processor-12         │   1,245,678     │        │
│  └──────────┴──────────────────────┴─────────────────┘        │
│                                                                │
│  Rebalancing Triggers:                                         │
│  • Consumer joins or leaves group                              │
│  • Consumer fails heartbeat (max.poll.interval.ms)             │
│  • Partition count changes                                     │
│                                                                │
│  During Rebalance:                                             │
│  1. All consumers stop processing                              │
│  2. Group coordinator reassigns partitions                     │
│  3. Consumers commit current offsets                           │
│  4. New assignments take effect                                │
│  5. Processing resumes                                         │
│  Duration: ~5-10 seconds                                       │
└────────────────────────────────────────────────────────────────┘
```

### Message Guarantees

```
┌────────────────────────────────────────────────────────────────┐
│  DELIVERY SEMANTICS                                            │
│  ──────────────────────────────────────────────────────────    │
│                                                                │
│  1. Producer → Kafka: AT LEAST ONCE                            │
│     Configuration:                                             │
│     • acks = all (wait for all replicas)                       │
│     • retries = 3                                              │
│     • enable.idempotence = true                                │
│                                                                │
│     Scenario: Network blip during send                         │
│     ┌────────┐  Send   ┌───────┐                              │
│     │Producer├────X────>│ Kafka │ (timeout)                    │
│     └───┬────┘          └───────┘                              │
│         │                                                      │
│         │ Retry (same msg-id)                                  │
│         └──────────────>│ Kafka │ (success)                    │
│                         └───────┘                              │
│     Result: Message written once (idempotent)                  │
│                                                                │
│  2. Kafka → Consumer: AT LEAST ONCE                            │
│     Configuration:                                             │
│     • enable.auto.commit = false                               │
│     • Manual commit after processing                           │
│                                                                │
│     Scenario: Consumer crashes after processing                │
│     ┌──────┐  Read   ┌────────┐  Process  ┌──────┐            │
│     │Kafka ├────────>│Consumer├──────────>│  DB  │            │
│     └──────┘         └───┬────┘           └──────┘            │
│                          │                                     │
│                          X Crash (before commit)               │
│                                                                │
│     ┌──────┐  Read   ┌────────┐  Process  ┌──────┐            │
│     │Kafka ├────────>│Consumer├──────────>│  DB  │            │
│     └──────┘  (retry) └───┬────┘  (dup?)  └──────┘            │
│                          │                                     │
│                          └─> Commit offset                     │
│                                                                │
│     Result: Possible duplicate processing                      │
│     Mitigation: Idempotent operations (upsert with ID)         │
│                                                                │
│  3. END-TO-END: EXACTLY ONCE (via idempotency)                 │
│     • Each review has unique ID                                │
│     • Database operations use UPSERT                           │
│     • Duplicate processing is safe                             │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔀 Decision Flow Logic

### Auto-Publish Decision Tree

```
                           ┌─────────────────┐
                           │  Review Data    │
                           │  + Scores       │
                           └────────┬────────┘
                                    │
                                    ▼
                  ┌─────────────────────────────────┐
                  │ Sentiment Score >= 0.8?         │
                  └────┬──────────────────┬─────────┘
                       │ YES              │ NO
                       ▼                  ▼
          ┌────────────────────┐   ┌──────────────────┐
          │ Fact Confidence    │   │ Sentiment Score   │
          │ >= 0.7?            │   │ >= 0.5?           │
          └─┬─────────────┬────┘   └─┬───────────┬────┘
            │ YES         │ NO       │ YES       │ NO
            ▼             ▼          ▼           ▼
      ┌─────────┐  ┌──────────┐ ┌─────────┐ ┌─────────┐
      │ PUBLISH │  │  QUEUE   │ │  QUEUE  │ │ REJECT  │
      │ AUTO    │  │  REVIEW  │ │ REVIEW  │ │ (SPAM)  │
      └────┬────┘  └────┬─────┘ └────┬────┘ └────┬────┘
           │            │            │           │
           │            │            │           │
           ▼            ▼            ▼           ▼
    ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
    │PostgreSQL │ │Admin     │ │Admin     │ │Log &    │
    │(published)│ │Panel     │ │Panel     │ │Discard  │
    │           │ │(high     │ │(low      │ │         │
    │+          │ │priority) │ │priority) │ │Notify   │
    │Astra DB   │ │          │ │          │ │User     │
    │(vectors)  │ │Notify    │ │Batch     │ │(rejected│
    │           │ │Admin     │ │Review    │ │review)  │
    └───────────┘ └──────────┘ └──────────┘ └─────────┘

Additional Rules (Applied Before Main Decision):

┌────────────────────────────────────────────────────────┐
│  PRE-FILTERS (Reject Immediately)                      │
│  ────────────────────────────────────────────────────  │
│  1. Text Length < 10 chars → REJECT (too short)        │
│  2. Profanity detected → QUEUE (manual review)         │
│  3. Duplicate text (exact match) → REJECT              │
│  4. User flagged as spam → REJECT                      │
│  5. Product not found → REJECT (invalid ref)           │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  POST-FILTERS (After Scoring)                          │
│  ────────────────────────────────────────────────────  │
│  1. Verified purchase required? Check                  │
│     → If no: Lower threshold to 0.6                    │
│  2. VIP customer? Prioritize in queue                  │
│  3. Critical keyword detected? Flag for review         │
│  4. Contextual rules (product-specific)                │
└────────────────────────────────────────────────────────┘
```

### Decision Statistics Example

```
Daily Processing Report (March 2, 2026)
─────────────────────────────────────────────────────────
Total Reviews Processed: 245,678
  
  ✓ Auto-Published:       198,542  (80.8%)
    └─ High confidence:   187,234  (94.3%)
    └─ Medium confidence:  11,308  (5.7%)
  
  ⚠ Queued for Review:     42,136  (17.2%)
    └─ Sentiment borderline: 23,451  (55.6%)
    └─ Fact check uncertain: 18,685  (44.4%)
  
  ✗ Rejected (Spam):        5,000  (2.0%)
    └─ Pre-filters:          4,234  (84.7%)
    └─ Negative scores:        766  (15.3%)

Average Decision Time: 1.8 seconds per review
Peak Processing: 4,532 reviews/minute (@ 14:23 UTC)
```

---

## 🚨 Error Handling & Recovery

### Failure Scenarios & Recovery

```
┌────────────────────────────────────────────────────────────┐
│  SCENARIO 1: Kafka Broker Failure                         │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Failure: One of 3 Kafka brokers crashes                  │
│                                                            │
│  Detection:                                                │
│  • ZooKeeper detects missing heartbeat (6 seconds)        │
│  • Controller elects new leader for affected partitions   │
│                                                            │
│  Impact:                                                   │
│  • Brief pause in writes (~2-5 seconds)                   │
│  • No data loss (replication factor = 3)                  │
│                                                            │
│  Recovery:                                                 │
│  1. Remaining brokers serve all partitions                │
│  2. Producers retry failed writes (built-in)              │
│  3. Consumers continue from last committed offset         │
│  4. Failed broker restarts automatically (k8s)            │
│  5. Partitions rebalance to restored broker               │
│                                                            │
│  Monitoring Alert:                                         │
│  • Prometheus: kafka_broker_offline                       │
│  • PagerDuty: P1 alert to on-call engineer                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  SCENARIO 2: PostgreSQL Connection Pool Exhaustion        │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Failure: All 100 DB connections in use                   │
│                                                            │
│  Detection:                                                │
│  • App logs: "Unable to acquire connection"               │
│  • Prometheus: connection_pool_active = max               │
│  • Response time increases (queuing)                      │
│                                                            │
│  Root Causes:                                              │
│  a) Traffic spike beyond capacity                         │
│  b) Long-running queries blocking pool                    │
│  c) Connection leak in application code                   │
│                                                            │
│  Immediate Action:                                         │
│  1. API Gateway circuit breaker opens (30s timeout)       │
│  2. Return 503 Service Unavailable to clients             │
│  3. Kafka consumer pauses processing (backpressure)       │
│                                                            │
│  Recovery:                                                 │
│  1. Kill long-running queries manually                    │
│  2. Scale up PostgreSQL (more resources)                  │
│  3. Add read replicas to distribute load                  │
│  4. Increase connection pool size (if safe)               │
│                                                            │
│  Prevention:                                               │
│  • Query timeout: 10 seconds                              │
│  • Connection timeout: 5 seconds                          │
│  • Idle connection reaper: 30 seconds                     │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  SCENARIO 3: OpenAI API Rate Limit / Timeout              │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Failure: GPT-4 API returns 429 Too Many Requests         │
│                                                            │
│  Detection:                                                │
│  • HTTP 429 response from api.openai.com                  │
│  • Header: Retry-After: 20 (seconds)                      │
│                                                            │
│  Immediate Action:                                         │
│  1. Exponential backoff retry                             │
│     - Wait 20 seconds (from header)                       │
│     - Retry with same request                             │
│     - If fail again: wait 40s, then 80s                   │
│  2. If all retries exhausted (3 attempts):                │
│     - Mark fact_confidence as null                        │
│     - Log warning with review_id                          │
│     - Route to manual review queue                        │
│                                                            │
│  Fallback Strategy:                                        │
│  Option A: Use cached responses (if similar review)       │
│  Option B: Skip fact check (sentiment-only decision)      │
│  Option C: Queue for batch reprocessing (off-peak)        │
│                                                            │
│  Prevention:                                               │
│  • Rate limiting: 100 req/min (OpenAI tier limit)        │
│  • Token bucket algorithm for smooth flow                 │
│  • Priority queue: VIP customers first                    │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  SCENARIO 4: Consumer Processing Failure                  │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Failure: Consumer crashes during processing              │
│                                                            │
│  Before Crash:                                             │
│  • Consumed 5 messages from Kafka (offsets 100-104)       │
│  • Processed 3 successfully (100-102)                     │
│  • Processing #4 (offset 103) → CRASH                     │
│  • Offset not yet committed                               │
│                                                            │
│  Recovery (Kubernetes):                                    │
│  1. Liveness probe fails after 30 seconds                 │
│  2. Pod marked as unhealthy                               │
│  3. New pod starts automatically                          │
│  4. Joins consumer group                                   │
│  5. Rebalance triggered                                    │
│  6. Receives partition assignment                         │
│  7. Starts reading from last committed offset (102)       │
│                                                            │
│  Result:                                                   │
│  • Messages 103-104 reprocessed (at-least-once)           │
│  • Idempotent operations prevent duplicates               │
│  • Total downtime: ~45 seconds for that partition         │
│                                                            │
│  Dead Letter Queue:                                        │
│  If message fails 3 times:                                 │
│  1. Publish to RabbitMQ 'reviews-dlq'                     │
│  2. Log error details in Elasticsearch                    │
│  3. Alert admin via Slack                                 │
│  4. Continue with next message (no blocking)              │
└────────────────────────────────────────────────────────────┘
```

---

## 📈 Monitoring & Observability Flow

### Telemetry Collection Pipeline

```
┌────────────────────────────────────────────────────────────┐
│  SERVICE INSTRUMENTATION                                   │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Each microservice exports:                                │
│  • Metrics: /metrics endpoint (Prometheus format)          │
│  • Logs: JSON to stdout (captured by Logstash)           │
│  • Traces: OpenTelemetry SDK (spans to Jaeger)            │
└─────┬──────────────────┬────────────────────┬─────────────┘
      │                  │                    │
      │ METRICS          │ LOGS               │ TRACES
      ▼                  ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Prometheus  │  │  Logstash    │  │  Jaeger          │
│  (Scraper)   │  │  (Collector) │  │  (Collector)     │
│              │  │              │  │                  │
│  Scrapes:    │  │  Processes:  │  │  Receives spans: │
│  /metrics    │  │  • Parse     │  │  • HTTP POST     │
│  every 15s   │  │  • Filter    │  │  • UDP compact   │
│              │  │  • Enrich    │  │  • gRPC          │
│              │  │              │  │                  │
│  Stores:     │  │  Forwards:   │  │  Stores:         │
│  TSDB        │  │  → ES        │  │  Cassandra /     │
│  15 days     │  │              │  │  Elasticsearch   │
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       │                 │                   │
       │                 │                   │
       ▼                 ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Grafana     │  │  Kibana      │  │  Jaeger UI       │
│  (Query)     │  │  (Search)    │  │  (Trace View)    │
│              │  │              │  │                  │
│  PromQL:     │  │  Lucene:     │  │  Visualize:      │
│  rate(http_  │  │  level:ERROR │  │  • Flame graphs  │
│  requests    │  │  AND @time.. │  │  • Span details  │
│  [5m])       │  │              │  │  • Dependencies  │
└──────────────┘  └──────────────┘  └──────────────────┘
```

### Distributed Tracing Example

A single review request generates this trace:

```
Trace ID: 7f3a9b2c-1d4e-5f6a-8b9c-0d1e2f3a4b5c
Duration: 1.547 seconds

├─ [0ms → 81ms] Span: HTTP POST /api/v1/reviews
│  Service: api-service
│  Tags: {http.method: POST, http.status: 202, user.id: "user-456"}
│  
│  ├─ [5ms → 20ms] Span: auth.validate_token
│  │  Service: auth-service
│  │  Tags: {token.valid: true, user.role: "seller"}
│  │
│  ├─ [25ms → 55ms] Span: kafka.publish
│  │  Service: kafka-client
│  │  Tags: {topic: "raw-reviews", partition: 7, offset: 1234567}
│  │
│  └─ [56ms → 81ms] Span: response.build
│     Service: api-service
│     Tags: {response.size: 156}
│
├─ [95ms → 145ms] Span: kafka.consume
│  Service: preprocessor
│  Tags: {partition: 7, offset: 1234567}
│
├─ [150ms → 200ms] Span: text.preprocess
│  Service: preprocessor
│  Tags: {original_length: 87, cleaned_length: 45}
│  
│  ├─ [155ms → 175ms] Span: spacy.tokenize
│  │  Service: preprocessor
│  │  Tags: {tokens: 12}
│  │
│  └─ [176ms → 200ms] Span: text.clean
│     Service: preprocessor
│     Tags: {operations: ["html", "emoji", "normalize"]}
│
├─ [205ms → 405ms] Span: sentiment.analyze
│  Service: sentiment-analyzer
│  Tags: {model: "distilbert", score: 0.94, batch_size: 1}
│  
│  ├─ [210ms → 230ms] Span: tokenizer.encode
│  │  Service: sentiment-analyzer
│  │  Tags: {input_ids_length: 128}
│  │
│  ├─ [235ms → 385ms] Span: model.forward
│  │  Service: sentiment-analyzer
│  │  Tags: {device: "cuda:0", dtype: "float16"}
│  │
│  └─ [386ms → 405ms] Span: output.postprocess
│     Service: sentiment-analyzer
│     Tags: {logits_shape: "[1, 2]"}
│
├─ [210ms → 1420ms] Span: fact.check (PARALLEL)
│  Service: fact-checker
│  Tags: {model: "gpt-4-turbo", confidence: 0.85}
│  
│  ├─ [215ms → 235ms] Span: facts.extract
│  │  Service: fact-checker
│  │  Tags: {facts_found: 2}
│  │
│  ├─ [240ms → 1405ms] Span: openai.api_call
│  │  Service: openai-client
│  │  Tags: {tokens_used: 287, model: "gpt-4-turbo"}
│  │  ⚠️  SLOW: Network latency + API processing
│  │
│  └─ [1406ms → 1420ms] Span: confidence.calculate
│     Service: fact-checker
│     Tags: {verified_facts: 2, total_facts: 2}
│
├─ [1425ms → 1430ms] Span: logic.evaluate
│  Service: logic-gate
│  Tags: {decision: "PUBLISH", rule: "high_confidence"}
│
├─ [1435ms → 1450ms] Span: postgres.insert
│  Service: database-client
│  Tags: {table: "reviews", rows: 1}
│  
│  └─ [1437ms → 1449ms] Span: sql.execute
│     Service: postgres
│     Query: INSERT INTO reviews...
│
├─ [1440ms → 1465ms] Span: astra.insert (PARALLEL)
│  Service: astra-client
│  Tags: {collection: "embeddings", doc_id: "rev-789012"}
│
└─ [1470ms → 1475ms] Span: kafka.commit
   Service: preprocessor
   Tags: {partition: 7, offset: 1234567}

🔍 INSIGHTS:
• Bottleneck: OpenAI API call (1.165s = 75% of total time)
• Parallelization: Sentiment + Fact-check saved ~1.2 seconds
• Database operations: Fast (15ms + 25ms)
• Critical path: Ingestion → Processing → OpenAI → Storage
```

---

## 🔄 Data Consistency Patterns

### Eventual Consistency Model

```
┌────────────────────────────────────────────────────────────┐
│  WRITE PATH (Review Creation)                              │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  T=0ms:    Client submits review                          │
│            ↓                                               │
│  T=81ms:   Kafka persists message                         │
│            ├→ PostgreSQL sees: OLD state (no review)      │
│            ├→ Astra DB sees: OLD state (no review)        │
│            └→ Redis cache: OLD state                      │
│            Client gets: 202 Accepted                       │
│                                                            │
│  T=1.5s:   Processing completes                           │
│            ├→ PostgreSQL: NEW state (review exists)       │
│            └→ Astra DB: NEW state (embedding exists)      │
│                                                            │
│  T=1.5s+:  Redis cache still OLD (until TTL or invalidate)│
│                                                            │
│  Consistency Window: ~1.5 seconds                          │
│                                                            │
│  User Impact:                                              │
│  If user queries immediately after POST:                   │
│    GET /api/v1/reviews/rev-789012                         │
│    → 404 Not Found (cache miss + DB not yet updated)      │
│                                                            │
│  Solution: Return tracking ID in POST response             │
│    {                                                       │
│      "review_id": "rev-789012",                           │
│      "status": "processing",                              │
│      "check_status_url": "/api/v1/reviews/rev-789012/..."│
│    }                                                       │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  READ PATH (User Dashboard Query)                          │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Query: "Show me all reviews for product ABC"             │
│                                                            │
│  Step 1: Check Redis Cache                                │
│  Key: "product:ABC:reviews:page:1"                        │
│  Result: CACHE HIT → Return immediately (5ms)             │
│                                                            │
│  Step 2: If cache miss → Query PostgreSQL                 │
│  SELECT * FROM reviews                                     │
│  WHERE product_id = 'ABC'                                  │
│  AND status = 'published'                                  │
│  ORDER BY timestamp DESC                                   │
│  LIMIT 20;                                                 │
│  Result: 20 reviews (25ms)                                 │
│                                                            │
│  Step 3: Store in Redis (async)                           │
│  Key: "product:ABC:reviews:page:1"                        │
│  TTL: 3600 seconds (1 hour)                               │
│                                                            │
│  Consistency Trade-off:                                    │
│  • Fast reads (cache: 5ms vs DB: 25ms)                    │
│  • Stale data possible (up to 1 hour via TTL)             │
│  • Acceptable for dashboard views                         │
│                                                            │
│  Cache Invalidation:                                       │
│  When new review published for product ABC:                │
│  1. Delete key: "product:ABC:reviews:*"                   │
│  2. Next read will cache miss → fetch fresh               │
└────────────────────────────────────────────────────────────┘
```

---

## ⚖️ Scaling & Load Management

### Auto-Scaling Orchestration

```
┌────────────────────────────────────────────────────────────┐
│  HORIZONTAL POD AUTOSCALER (HPA) WORKFLOW                  │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Target: API Service Deployment                            │
│  Metric: CPU Utilization                                   │
│  Threshold: 70%                                            │
│  Current Replicas: 3                                       │
│  Min Replicas: 3                                           │
│  Max Replicas: 10                                          │
│                                                            │
│  Every 15 seconds, HPA checks:                             │
│                                                            │
│  T=0s:   │ Pod 1: CPU 68% │ Pod 2: CPU 72% │ Pod 3: CPU 71% │
│          Average: 70.3% → TRIGGER SCALE UP                 │
│                                                            │
│  T=5s:   Kubernetes creates Pod 4                          │
│          Status: ContainerCreating                         │
│                                                            │
│  T=15s:  Pod 4 starts, runs readiness probe                │
│          Health check: GET /health → 200 OK                │
│          Status: Running, Ready                            │
│                                                            │
│  T=20s:  Load Balancer adds Pod 4 to rotation             │
│          Traffic now distributed across 4 pods             │
│          │ Pod 1: CPU 54% │ Pod 2: CPU 56% │               │
│          │ Pod 3: CPU 53% │ Pod 4: CPU 55% │               │
│          Average: 54.5% → Stable                           │
│                                                            │
│  T=300s: (5 min later) CPU still low                       │
│          Average: 45% → TRIGGER SCALE DOWN                 │
│                                                            │
│  T=305s: Kubernetes marks Pod 4 for termination            │
│          • Graceful shutdown period: 30 seconds            │
│          • Stop accepting new requests                     │
│          • Complete in-flight requests                     │
│          • Close connections                               │
│                                                            │
│  T=335s: Pod 4 terminated                                  │
│          Back to 3 replicas                                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  KAFKA CONSUMER SCALING                                    │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Topic: raw-reviews (12 partitions)                        │
│  Current Consumers: 12 (optimal: 1 per partition)          │
│                                                            │
│  Monitoring Kafka Lag:                                     │
│  Lag = Latest Offset - Consumer Offset                     │
│                                                            │
│  Normal State:                                             │
│  Partition 0: Lag = 50 messages (~5 seconds behind)       │
│  Partition 1: Lag = 42 messages                           │
│  ...                                                       │
│  Average Lag: 45 messages → HEALTHY                        │
│                                                            │
│  Traffic Spike:                                            │
│  T=0:    Ingestion rate: 1000 → 5000 reviews/min          │
│          Consumers can't keep up                           │
│                                                            │
│  T=60s:  Partition 0: Lag = 2,345 messages (~4 min)       │
│          Partition 1: Lag = 2,198 messages                │
│          Average Lag: 2,200 messages → WARNING             │
│          Alert: Slack notification to ops team             │
│                                                            │
│  T=120s: Lag = 4,500 messages → CRITICAL                   │
│          Alert: PagerDuty escalation                       │
│                                                            │
│  Manual Intervention (cannot auto-scale beyond partitions):│
│  Option 1: Add more partitions (requires rebalance)        │
│            - Increase to 24 partitions                     │
│            - Add 12 more consumer instances                │
│            - Rebalancing takes ~30 seconds                 │
│                                                            │
│  Option 2: Optimize processing (faster consumers)          │
│            - Increase batch size: 32 → 64                  │
│            - Add GPU resources for sentiment analysis      │
│            - Reduce external API calls (cache more)        │
│                                                            │
│  Option 3: Backpressure to producers                       │
│            - Return 429 Too Many Requests from API         │
│            - Slow down batch processor                     │
└────────────────────────────────────────────────────────────┘
```

---

## 🎯 Summary

### Key Orchestration Principles

1. **Asynchronous Processing**: Decouple ingestion from processing using Kafka
2. **Eventually Consistent**: Accept temporary inconsistency for better performance
3. **Idempotent Operations**: Safe to retry operations without side effects
4. **Graceful Degradation**: System continues with reduced functionality on failures
5. **Observable**: Comprehensive metrics, logs, and traces for debugging
6. **Scalable**: Horizontal scaling for all stateless services
7. **Resilient**: Circuit breakers, retries, and fallbacks everywhere

### Performance Characteristics

| Operation | Latency (p50) | Latency (p99) | Throughput |
|-----------|---------------|---------------|------------|
| API Request | 81ms | 150ms | 10K req/min |
| Kafka Publish | 30ms | 95ms | 100K msg/min |
| Processing Pipeline | 1.5s | 3.2s | 64 reviews/sec |
| PostgreSQL Query | 15ms | 45ms | 5K qps |
| Astra Vector Search | 35ms | 120ms | 1K qps |
| Redis Cache Hit | 2ms | 8ms | 50K qps |

### Monitoring Checklist

- [ ] All services exporting metrics to Prometheus
- [ ] Grafana dashboards showing key metrics
- [ ] ELK stack collecting and indexing logs
- [ ] Jaeger tracing enabled with 10% sampling
- [ ] AlertManager configured with escalation rules
- [ ] PagerDuty integration for critical alerts
- [ ] Slack notifications for warnings
- [ ] Daily capacity planning reports
- [ ] Weekly performance review meetings

---

**Document Version**: 1.0  
**Last Updated**: March 2, 2026  
**Next Review**: April 2, 2026  
**Owner**: Platform Architecture Team
