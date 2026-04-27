# Frontend Guide

The frontend is an Angular 20 single-page app under [frontend/](../frontend/). It serves a single dashboard route that flips between two portal views: **Super Admin** and **Seller**.

## Entry point and routing

- [main.ts](../frontend/src/main.ts) bootstraps `AppComponent` with `appConfig`.
- [app.config.ts](../frontend/src/app/app.config.ts) registers the router and `HttpClient`.
- [app.routes.ts](../frontend/src/app/app.routes.ts) defines a single route — everything renders inside `DashboardComponent`. The wildcard route redirects to `''`.

There is no auth guard. The portal-view switch is in-component state, not a route change.

## Component tree

```
AppComponent
└── DashboardComponent                  (frontend/src/app/components/dashboard)
    ├── StatsBarComponent               (top counters)
    ├── ReviewCardComponent (× n)       (each review tile)
    ├── AddReviewModalComponent         (create form, opened from product cards)
    └── ReviewDetailModalComponent      (drill-in with pipeline + analysis details)
```

All components are **standalone**; there is no `NgModule`. `DashboardComponent` imports its children directly.

## Dashboard state model

`DashboardComponent` ([components/dashboard/dashboard.ts](../frontend/src/app/components/dashboard/dashboard.ts)) is the orchestrator. The most important fields:

| Field | Meaning |
| --- | --- |
| `activePortal: 'super-admin' \| 'seller'` | Which portal view is rendered. Toggled via `setPortal()`. |
| `products: ProductCatalogItem[]` | Catalog from `GET /api/products`, paginated client-side. |
| `reviews: Review[]` | Full admin list from `GET /api/admin/reviews`. |
| `filteredReviews: Review[]` | `reviews` after search/rating/publish filters; what the super-admin grid renders. |
| `sellerReviews` (getter) | `reviews` filtered to `selectedSellerId`; what the seller portal renders. |
| `selectedIds: Set<string>` | Multi-select for bulk actions. |
| `sellerAnalytics`, `sellerTrends`, `sellerAspects` | Cached analytics for the active seller. |
| `pipelineAutomationEnabled`, `automationThreshold` | Local UI hint — a real toggle would `PATCH /admin/moderation-config`. |

Computed views (`sellers`, `pipelineMetrics`, `pendingPipelineReviews`, `sellerMoodBars`, `sellerTopSignals`, etc.) are pure getters over `reviews` + `products`.

## Data flow

1. `ngOnInit` calls `loadProducts()`, `loadReviews()`, `loadStatistics()` in parallel.
2. `loadProducts` populates the product grid and seeds `selectedSellerId` to the first seller, then triggers `loadSellerAnalytics()`.
3. `loadReviews` calls `ReviewService.getReviews()` → `GET /api/admin/reviews`, sorts newest-first, then re-runs `applyFilters()` and `loadSellerAnalytics()`.
4. `loadSellerAnalytics` fans out three calls: summary / trends / aspects, into `sellerAnalytics` / `sellerTrends` / `sellerAspects`.
5. Mutations (`onTogglePublish`, `onBulkPublish`, `onBulkUnpublish`, `onBulkDelete`, `onDelete`, `onReviewSubmitted`) call into `ReviewService`, then either patch the local list optimistically or re-`loadReviews()`.

Toasts are shown via `showToast(...)` with a 3.2s auto-dismiss timer.

## Services

### `ReviewService` ([services/review.service.ts](../frontend/src/app/services/review.service.ts))

Wraps the user-facing and admin review endpoints. Core methods:

| Method | Backend call |
| --- | --- |
| `getProducts()` | `GET /api/products` |
| `getReviews()` | `GET /api/admin/reviews` (sorted newest-first) |
| `getById(id)` | `GET /api/reviews/{id}` |
| `create(dto)` | `POST /api/reviews` |
| `publish(id)` / `unpublish(id)` | `POST /api/admin/reviews/{id}/publish\|unpublish` |
| `delete(id)` | `DELETE /api/admin/reviews/{id}` (sends `actor` + `reason` in the body) |
| `bulkPublish` / `bulkUnpublish` / `bulkDelete` | `forkJoin` over the singular calls |
| `setPublishStatus(id, isActive)` / `togglePublish` | dispatches to `publish` or `unpublish` |
| `search` / `fetchAll` / `fetchPublished` / `fetchUnpublished` | client-side filter helpers over `getReviews()` |
| `markHelpful` / `markUnhelpful` | local stub (no backend route yet) |

`mapBackendReview` is the translation seam: snake_case + 0..1 scores → camelCase + 0..100 percentages, plus the `pipelineStatus` mapping (`approved` / `manual-review` / `blocked` / `pending`).

### `AnalyticsService` ([services/analytics.service.ts](../frontend/src/app/services/analytics.service.ts))

Thin pass-through for the seller analytics endpoints. Returns the snake_case shapes from the API directly — `dashboard.ts` consumes them as-is.

| Method | Backend call |
| --- | --- |
| `getSummary(sellerId)` | `GET /api/seller/{id}/analytics/summary` |
| `getTrends(sellerId)` | `GET /api/seller/{id}/analytics/trends` |
| `getAspects(sellerId)` | `GET /api/seller/{id}/analytics/aspects` |
| `getSellerReviews(sellerId)` | `GET /api/seller/{id}/reviews` |

## Environment configuration

[environments/environment.ts](../frontend/src/environments/environment.ts) holds the API base URL:

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:4500/api',
};
```

`environment.prod.ts` should mirror this with the production URL when deploying. Both are imported via the standard Angular file-replacement mechanism configured in [angular.json](../frontend/angular.json).

## Portal flows

### Super-admin portal

- Renders the full review grid with bulk-action toolbar (publish, unpublish, delete) and per-row toggle.
- Includes the "Pending pipeline" panel (from `pendingPipelineReviews`) — anything in `manual-review` or `blocked` sorted by ascending `pipelineScore`.
- The "Pipeline metrics" cards summarize automation state, auto-approved/manual/blocked counts (computed from `reviews[].pipelineStatus`).
- The "Pipeline automation" toggle currently only flips the local flag and shows a toast. Wiring it to `PATCH /admin/moderation-config` is a one-line change and on the TODO list.

### Seller portal

- Gated by `selectedSellerId`. Reviews narrow to that seller.
- "Mood bars" come from the analytics summary's `sentiment_split` (positive/mixed/negative).
- "Category performance" comes from `sellerAspects` — buckets `positive_mentions / neutral_mentions / negative_mentions` into a 4 / 3 / 2 rating proxy.
- "Trend" maps `avg_rating × 20` to a 0..100 score per `date_label`.
- "Top signals" surface the strongest positive review and any flagged review.

## Submitting a review (UI flow)

1. Super-admin clicks **Write review** on a `ProductCatalogItem` card.
2. `openReviewModal(product)` sets `selectedProductIdForReview` and shows `AddReviewModalComponent`.
3. The modal collects title, description, rating, optional media URLs, and emits a `CreateSiteReviewDto`.
4. `onReviewSubmitted` calls `ReviewService.create()` which `POST`s `/api/reviews`.
5. The backend returns immediately with `status=queued`. The dashboard re-fetches via `loadReviews()` to pick up the eventual `published` / `pending_manual_review` / `rejected` outcome.

There is no websocket / polling — the user must reload or perform another action to see the post-pipeline status.

## Build / serve

```bash
cd frontend
npm install
ng serve            # http://localhost:4200, with HMR
ng build            # production build into dist/
```

CORS on the backend allows `http://localhost:4200` by default — change `REVIEW_CORS_ORIGINS` to match a different frontend host.
