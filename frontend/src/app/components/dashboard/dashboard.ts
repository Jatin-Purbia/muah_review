import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService } from '../../services/review.service';
import { AnalyticsService, SellerAnalyticsSummary, SellerTrendPoint, SellerAspectInsight } from '../../services/analytics.service';
import { Review, CreateSiteReviewDto, ProductCatalogItem, PublishFilter, SiteCategoryReview, PipelineStatus, REVIEW_CATEGORIES } from '../../models/review.model';
import { ReviewCardComponent } from '../review-card/review-card';
import { StatsBarComponent } from '../stats-bar/stats-bar';
import { AddReviewModalComponent } from '../add-review-modal/add-review-modal';
import { ReviewDetailModalComponent } from '../review-detail-modal/review-detail-modal';

type PortalView = 'super-admin' | 'seller';
type BulkAction = 'publish' | 'unpublish' | 'block' | 'delete' | null;

interface SellerSummary {
  id: string;
  name: string;
  totalReviews: number;
  publishedReviews: number;
  averageRating: number;
  satisfaction: number;
  positiveShare: number;
}

interface PipelineMetric {
  label: string;
  value: string;
  note: string;
  tone: 'default' | 'good' | 'warn' | 'danger';
}

interface CategoryTabStat {
  id: string;
  category: string;
  reviewerCount: number;
  rating: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReviewCardComponent, StatsBarComponent, AddReviewModalComponent, ReviewDetailModalComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly reviewCategories = [...REVIEW_CATEGORIES];
  products: ProductCatalogItem[] = [];
  reviews: Review[] = [];
  filteredReviews: Review[] = [];
  categoryStats: SiteCategoryReview[] = [];
  loading = false;
  error = '';
  searchQuery = '';
  selectedCategory = '';
  selectedCategoryKey: string | null = null;
  selectedRating = 0;
  publishFilter: PublishFilter = 'all';
  showModal = false;
  selectedProductIdForReview: string | null = null;
  successMessage = '';
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  reviewSubmitting = false;
  reviewSubmitError = '';
  productPage = 1;
  readonly productPageSize = 12;
  processingReviewIds = new Set<string>();
  private processingPollTimers = new Map<string, ReturnType<typeof setTimeout>>();

  selectedIds = new Set<string>();
  bulkLoading = false;
  activeBulkAction: BulkAction = null;
  selectedReviewForDetail: Review | null = null;

  activePortal: PortalView = 'super-admin';
  pipelineAutomationEnabled = true;
  automationThreshold = 72;
  selectedSellerId = '';

  get someSelected(): boolean { return this.selectedIds.size > 0; }
  get selectedCount(): number { return this.selectedIds.size; }
  get selectedIdsArray(): string[] { return [...this.selectedIds]; }

  get allSelected(): boolean {
    return this.filteredReviews.length > 0 && this.filteredReviews.every((review) => this.selectedIds.has(review.id));
  }

  get displayedReviews(): Review[] {
    return this.activePortal === 'super-admin' ? this.filteredReviews : this.sellerReviews;
  }

  get sellerReviews(): Review[] {
    return this.reviews.filter((review) => review.sellerId === this.selectedSellerId);
  }

  get productTotalPages(): number {
    return Math.max(1, Math.ceil(this.products.length / this.productPageSize));
  }

  get pagedProducts(): ProductCatalogItem[] {
    const start = (this.productPage - 1) * this.productPageSize;
    return this.products.slice(start, start + this.productPageSize);
  }

  get productRangeStart(): number {
    return this.products.length ? (this.productPage - 1) * this.productPageSize + 1 : 0;
  }

  get productRangeEnd(): number {
    return Math.min(this.productPage * this.productPageSize, this.products.length);
  }

  get sellerPublishedReviews(): Review[] {
    return this.sellerReviews.filter((review) => review.isActive);
  }

  get sellerFlaggedReviews(): Review[] {
    return this.sellerReviews.filter((review) => review.pipelineStatus !== 'approved');
  }

  get sellers(): SellerSummary[] {
    const groups = new Map<string, ProductCatalogItem[]>();

    for (const product of this.products) {
      const list = groups.get(product.sellerId) ?? [];
      list.push(product);
      groups.set(product.sellerId, list);
    }

    return [...groups.entries()].map(([sellerId, sellerProducts]) => {
      const sellerReviews = this.reviews.filter((review) => review.sellerId === sellerId);
      const totalReviews = sellerReviews.length;
      const publishedReviews = sellerReviews.filter((review) => review.isActive).length;
      const averageRating = totalReviews ? sellerReviews.reduce((sum, review) => sum + (review.starRating ?? 0), 0) / totalReviews : 0;
      const positiveShare = totalReviews
        ? Math.round((sellerReviews.filter((review) => (review.sentimentScore ?? 0) >= 70).length / totalReviews) * 100)
        : 0;
      const satisfaction = totalReviews
        ? Math.round(sellerReviews.reduce((sum, review) => sum + (review.sentimentScore ?? 0), 0) / totalReviews)
        : 0;

      return {
        id: sellerId,
        name: sellerProducts[0]?.sellerName ?? 'Unknown seller',
        totalReviews,
        publishedReviews,
        averageRating,
        satisfaction,
        positiveShare,
      };
    });
  }

  get selectedSeller(): SellerSummary | undefined {
    const seller = this.sellers.find((seller) => seller.id === this.selectedSellerId);
    if (seller && this.sellerAnalytics) {
      return {
        ...seller,
        totalReviews: this.sellerAnalytics.total_reviews,
        publishedReviews: this.sellerAnalytics.published_reviews,
        averageRating: this.sellerAnalytics.avg_rating,
        satisfaction: Math.round(this.sellerAnalytics.avg_rating * 20),
        positiveShare: Math.round(
          (this.sellerAnalytics.sentiment_split.positive / this.sellerAnalytics.total_reviews) * 100
        ),
      };
    }
    return seller;
  }

  get pipelineMetrics(): PipelineMetric[] {
    const totalPublished = this.reviews.filter((review) => review.isActive).length;
    const approved = this.reviews.filter((review) => review.pipelineStatus === 'approved').length;
    const manualReview = this.reviews.filter((review) => review.pipelineStatus === 'manual-review').length;
    const blocked = this.reviews.filter((review) => review.pipelineStatus === 'blocked').length;

    return [
      { label: 'Pipeline automation', value: this.pipelineAutomationEnabled ? 'On' : 'Off', note: `Threshold ${this.automationThreshold}`, tone: this.pipelineAutomationEnabled ? 'good' : 'warn' },
      { label: 'Auto-approved', value: `${approved}`, note: `${totalPublished} live on website`, tone: 'good' },
      { label: 'Manual queue', value: `${manualReview}`, note: 'Needs super admin review', tone: manualReview > 0 ? 'warn' : 'default' },
      { label: 'Blocked', value: `${blocked}`, note: 'Held back from website', tone: blocked > 0 ? 'danger' : 'default' },
    ];
  }

  get pendingPipelineReviews(): Review[] {
    return this.reviews
      .filter((review) => review.pipelineStatus === 'manual-review' || review.pipelineStatus === 'blocked')
      .sort((a, b) => (a.pipelineScore ?? 0) - (b.pipelineScore ?? 0));
  }

  get categoryTabs(): CategoryTabStat[] {
    return this.reviewCategories.map((category, index) => {
      const key = category.toLowerCase();
      const reviewsForCategory = this.reviews.filter((review) => {
        const reviewCategory = (review.category || review.reviewCategory || '').trim().toLowerCase();
        return reviewCategory === key;
      });
      const reviewerCount = reviewsForCategory.length;
      const rating = reviewerCount
        ? reviewsForCategory.reduce((sum, review) => sum + (review.starRating ?? 0), 0) / reviewerCount
        : 0;

      return {
        id: `fallback-${index}`,
        category,
        reviewerCount,
        rating,
      };
    });
  }

  get sellerMoodBars(): { label: string; value: number; tone: string }[] {
    if (this.sellerAnalytics) {
      const total = this.sellerAnalytics.total_reviews || 1;
      return [
        { label: 'Happy', value: Math.round((this.sellerAnalytics.sentiment_split.positive / total) * 100), tone: 'good' },
        { label: 'Mixed', value: Math.round((this.sellerAnalytics.sentiment_split.mixed / total) * 100), tone: 'warn' },
        { label: 'Unhappy', value: Math.round((this.sellerAnalytics.sentiment_split.negative / total) * 100), tone: 'danger' },
      ];
    }

    const reviews = this.sellerReviews;
    const total = reviews.length || 1;

    return [
      { label: 'Happy', value: Math.round((reviews.filter((review) => (review.sentimentScore ?? 0) >= 70).length / total) * 100), tone: 'good' },
      { label: 'Mixed', value: Math.round((reviews.filter((review) => (review.sentimentScore ?? 0) >= 45 && (review.sentimentScore ?? 0) < 70).length / total) * 100), tone: 'warn' },
      { label: 'Unhappy', value: Math.round((reviews.filter((review) => (review.sentimentScore ?? 0) < 45).length / total) * 100), tone: 'danger' },
    ];
  }

  get sellerCategoryPerformance(): { category: string; rating: number; mentions: number }[] {
    // Group reviews by category and calculate average rating for each
    const categoryMap = new Map<string, { ratings: number[]; count: number }>();
    
    for (const review of this.sellerReviews) {
      const category = review.category ?? 'Products';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { ratings: [], count: 0 });
      }
      const data = categoryMap.get(category)!;
      data.ratings.push(review.starRating);
      data.count++;
    }

    return this.reviewCategories
      .map((category) => {
        const data = categoryMap.get(category);
        const avgRating = data && data.ratings.length > 0 
          ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 10) / 10
          : 0;
        const mentions = data?.count ?? 0;
        return {
          category,
          rating: avgRating,
          mentions,
        };
      })
      .filter((item) => item.mentions > 0); // Only show categories with reviews
  }

  get sellerTrend(): { month: string; score: number }[] {
    return this.sellerTrends.map((trend) => ({
      month: trend.date_label,
      score: Math.round(trend.avg_rating * 20),
    }));
  }

  get sellerTopSignals(): { title: string; body: string; tone: 'good' | 'warn' | 'danger' }[] {
    const topNegative = this.sellerFlaggedReviews[0];
    const topPositive = [...this.sellerReviews].sort((a, b) => (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0))[0];
    const signals: { title: string; body: string; tone: 'good' | 'warn' | 'danger' }[] = [];

    if (topPositive) {
      signals.push({
        title: 'What customers love',
        body: `${topPositive.productName}: strongest signal around ${topPositive.segments?.[0]?.segment?.toLowerCase() ?? 'overall product quality'}.`,
        tone: 'good',
      });
    }

    if (topNegative) {
      signals.push({
        title: 'What needs work',
        body: `${topNegative.productName}: pipeline flagged concerns around ${topNegative.segments?.find((segment) => segment.sentiment === 'negative')?.segment?.toLowerCase() ?? 'review sentiment'}.`,
        tone: 'danger',
      });
    }

    if (this.sellerReviews.length > 0) {
      signals.push({
        title: 'Action recommendation',
        body: this.sellerFlaggedReviews.length > 0
          ? `${this.sellerFlaggedReviews.length} review(s) still need attention before the seller view is fully clear.`
          : `${this.sellerPublishedReviews.length} published review(s) are currently live with no flagged seller issues.`,
        tone: this.sellerFlaggedReviews.length > 0 ? 'warn' : 'good',
      });
    }

    return signals;
  }

  sellerAnalytics: SellerAnalyticsSummary | null = null;
  sellerTrends: SellerTrendPoint[] = [];
  sellerAspects: SellerAspectInsight[] = [];

  constructor(
    private reviewService: ReviewService,
    private analyticsService: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.loadProducts();
    this.loadReviews();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    for (const timer of this.processingPollTimers.values()) {
      clearTimeout(timer);
    }
    this.processingPollTimers.clear();
  }

  loadProducts(): void {
    this.reviewService.getProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.productPage = 1;
        if (!this.selectedSellerId && this.sellers[0]) {
          this.selectedSellerId = this.sellers[0].id;
          this.loadSellerAnalytics();
        }
      },
      error: () => {
        this.error = 'Failed to load products.';
      },
    });
  }

  loadStatistics(): void {
    this.reviewService.getStatistics().subscribe({
      next: (data) => { this.categoryStats = (data || []).filter((stat) => !!stat.category); },
      error: () => { /* non-critical */ },
    });
  }

  loadSellerAnalytics(): void {
    if (!this.selectedSellerId) {
      return;
    }
    this.sellerAnalytics = null;
    this.sellerTrends = [];
    this.sellerAspects = [];
    this.analyticsService.getSummary(this.selectedSellerId).subscribe({
      next: (summary) => { this.sellerAnalytics = summary; },
      error: () => { this.sellerAnalytics = null; },
    });
    this.analyticsService.getTrends(this.selectedSellerId).subscribe({
      next: (trends) => { this.sellerTrends = trends; },
      error: () => { this.sellerTrends = []; },
    });
    this.analyticsService.getAspects(this.selectedSellerId).subscribe({
      next: (aspects) => { this.sellerAspects = aspects; },
      error: () => { this.sellerAspects = []; },
    });
  }

  loadReviews(): void {
    this.loading = true;
    this.error = '';
    this.reviewService.getReviews().subscribe({
      next: (data) => {
        this.reviews = data;
        const loadedIds = new Set(data.map((review) => review.id));
        for (const reviewId of [...this.processingReviewIds]) {
          if (!loadedIds.has(reviewId)) {
            this.processingReviewIds.delete(reviewId);
            this.clearProcessingPoll(reviewId);
          }
        }
        if (!this.sellers.find((seller) => seller.id === this.selectedSellerId) && this.sellers[0]) {
          this.selectedSellerId = this.sellers[0].id;
        }
        this.applyFilters();
        this.loadSellerAnalytics();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load reviews. Please try again.';
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    let result = [...this.reviews];

    if (this.publishFilter === 'published') {
      result = result.filter((review) => review.isActive);
    } else if (this.publishFilter === 'unpublished') {
      result = result.filter((review) => !review.isActive);
    }

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter((review) =>
        (review.title || '').toLowerCase().includes(query) ||
        (review.description || '').toLowerCase().includes(query) ||
        (review.sellerName || '').toLowerCase().includes(query) ||
        (review.productName || '').toLowerCase().includes(query)
      );
    }

    if (this.selectedRating > 0) {
      const star = Number(this.selectedRating);
      result = result.filter((review) => review.starRating === star);
    }

    if (this.selectedCategoryKey) {
      result = result.filter((review) => {
        const reviewCategory = (review.category || review.reviewCategory || '').trim().toLowerCase();
        return reviewCategory === this.selectedCategoryKey;
      });
    }

    this.filteredReviews = result;
  }

  setPortal(view: PortalView): void {
    this.activePortal = view;
  }

  togglePipelineAutomation(): void {
    this.pipelineAutomationEnabled = !this.pipelineAutomationEnabled;
    this.successMessage = this.pipelineAutomationEnabled
      ? 'Auto-publish moderation is now enabled for published seller reviews.'
      : 'Auto-publish moderation is now disabled. Super admin review is required.';
    setTimeout(() => (this.successMessage = ''), 3200);
  }

  selectCategoryKey(key: string | null): void {
    this.selectedCategoryKey = key ? key.toLowerCase() : null;
    this.selectedCategory = '';
    this.applyFilters();
  }

  setPublishFilter(filter: PublishFilter): void {
    this.publishFilter = filter;
    this.applyFilters();
  }

  isSelected(id: string): boolean { return this.selectedIds.has(id); }

  get publishedCount(): number { return this.reviews.filter((review) => review.isActive).length; }
  get unpublishedCount(): number { return this.reviews.filter((review) => !review.isActive).length; }
  get needsActionCount(): number {
    return this.reviews.filter((review) => !review.isActive).length;
  }

  get categories(): string[] {
    return [...new Set(this.reviews.map((review) => review.productName).filter(Boolean) as string[])];
  }

  get averageRating(): number {
    if (!this.reviews.length) return 0;
    return this.reviews.reduce((sum, review) => sum + (review.starRating ?? 0), 0) / this.reviews.length;
  }

  get ratingDistribution(): { star: number; count: number }[] {
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: this.reviews.filter((review) => review.starRating === star).length,
    }));
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.selectedCategoryKey = null;
    this.selectedRating = 0;
    this.applyFilters();
  }

  onTogglePublish(event: { review: Review; published: boolean }): void {
    this.reviewService.togglePublish(event.review.id, event.published).subscribe({
      next: (response) => {
        this.reviews = this.reviews.map((review) => review.id === response.id
          ? {
              ...review,
              isActive: response.isActive,
              pipelineStatus: response.isActive ? 'approved' : 'manual-review',
              updatedAt: new Date().toISOString(),
            }
          : review
        );
        this.applyFilters();
        this.loadSellerAnalytics();
        this.showToast(response.isActive ? 'Review published to website.' : 'Review moved back to moderation.', 'success');
      },
      error: () => {
        this.showToast('Failed to update publish state.', 'error');
      },
    });
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.filteredReviews.forEach((review) => this.selectedIds.delete(review.id));
    } else {
      this.filteredReviews.forEach((review) => this.selectedIds.add(review.id));
    }
  }

  toggleSelectOne(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.activeBulkAction = null;
  }

  onBulkPublish(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.activeBulkAction = 'publish';
    this.reviewService.bulkPublish(ids).subscribe({
      next: () => {
        this.selectedIds.clear();
        this.loadReviews();
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast(`${ids.length} review(s) published.`, 'success');
      },
      error: () => {
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast('Bulk publish failed.', 'error');
      },
    });
  }

  onBulkUnpublish(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.activeBulkAction = 'unpublish';
    this.reviewService.bulkUnpublish(ids).subscribe({
      next: () => {
        this.selectedIds.clear();
        this.loadReviews();
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast(`${ids.length} review(s) moved to moderation.`, 'success');
      },
      error: () => {
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast('Bulk unpublish failed.', 'error');
      },
    });
  }

  onBulkDelete(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.activeBulkAction = 'delete';
    this.reviewService.bulkDelete(ids).subscribe({
      next: () => {
        this.reviews = this.reviews.filter((review) => !ids.includes(review.id));
        this.selectedIds.clear();
        this.applyFilters();
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast(`${ids.length} review(s) deleted.`, 'success');
      },
      error: () => {
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast('Bulk delete failed.', 'error');
      },
    });
  }

  onDelete(review: Review): void {
    this.reviewService.deleteReview(review.id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter((item) => item.id !== review.id);
        this.applyFilters();
        this.showToast('Review deleted successfully.', 'success');
      },
      error: () => {
        this.showToast('Failed to delete review.', 'error');
      },
    });
  }

  onReviewSubmitted(dto: CreateSiteReviewDto): void {
    this.reviewSubmitting = true;
    this.reviewSubmitError = '';
    this.reviewService.createReview(dto).subscribe({
      next: (createdReview) => {
        const selectedProduct = this.products.find((product) => product.id === dto.productId);
        const enrichedReview: Review = {
          ...createdReview,
          category: createdReview.category || dto.category,
          sellerId: createdReview.sellerId || dto.sellerId,
          sellerName: selectedProduct?.sellerName ?? createdReview.sellerName ?? dto.sellerId,
          productName: selectedProduct?.name ?? createdReview.productName ?? dto.productId,
          pipelineStatus: createdReview.pipelineStatus ?? 'pending',
          isActive: createdReview.isActive ?? false,
        };

        this.reviews = [enrichedReview, ...this.reviews.filter((review) => review.id !== enrichedReview.id)];
        this.processingReviewIds.add(enrichedReview.id);
        this.applyFilters();
        this.loadSellerAnalytics();
        this.loadStatistics();

        this.reviewSubmitting = false;
        this.showModal = false;
        this.selectedProductIdForReview = null;
        this.showToast('Review submitted. Processing moderation now...', 'success');
        this.startProcessingPoll(enrichedReview.id);
      },
      error: () => {
        this.reviewSubmitting = false;
        this.reviewSubmitError = 'Failed to submit review. Please check the details and try again.';
      },
    });
  }

  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toastMessage = message;
    this.toastType = type;
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
      this.toastTimer = null;
    }, 3200);
  }

  trackByReview(index: number, review: Review): string {
    return review.id;
  }

  trackByLabel(index: number, item: { label: string }): string {
    return item.label;
  }

  pipelineToneClass(status: PipelineStatus | undefined): string {
    return status === 'approved'
      ? 'good'
      : status === 'manual-review'
        ? 'warn'
        : status === 'blocked'
          ? 'danger'
          : 'default';
  }

  onViewReviewDetails(review: Review): void {
    this.selectedReviewForDetail = review;
  }

  onCloseReviewDetail(): void {
    this.selectedReviewForDetail = null;
  }

  previousProductPage(): void {
    if (this.productPage > 1) {
      this.productPage -= 1;
    }
  }

  nextProductPage(): void {
    if (this.productPage < this.productTotalPages) {
      this.productPage += 1;
    }
  }

  openReviewModal(product?: ProductCatalogItem): void {
    if (!product) {
      this.error = 'Choose Write Review on a product card so the product and seller are selected automatically.';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }

    this.reviewSubmitError = '';
    this.reviewSubmitting = false;
    this.selectedProductIdForReview = product.id;
    this.showModal = true;
  }

  isProcessingReview(reviewId: string): boolean {
    return this.processingReviewIds.has(reviewId);
  }

  private startProcessingPoll(reviewId: string, attempt = 0): void {
    this.clearProcessingPoll(reviewId);

    this.reviewService.getById(reviewId).subscribe({
      next: (review) => {
        this.reviews = this.reviews.map((item) => item.id === reviewId
          ? {
              ...item,
              ...review,
              sellerName: review.sellerName || item.sellerName,
              productName: review.productName || item.productName,
            }
          : item
        );
        this.applyFilters();
        this.loadSellerAnalytics();
        this.loadStatistics();

        if (review.pipelineStatus === 'pending' && attempt < 20) {
          const timer = setTimeout(() => this.startProcessingPoll(reviewId, attempt + 1), 1200);
          this.processingPollTimers.set(reviewId, timer);
          return;
        }

        this.processingReviewIds.delete(reviewId);
        this.clearProcessingPoll(reviewId);

        if (review.pipelineStatus === 'approved') {
          this.showToast('Review processed and published.', 'success');
        } else if (review.pipelineStatus === 'manual-review') {
          this.showToast('Review processed and moved to manual review.', 'success');
        } else if (review.pipelineStatus === 'blocked') {
          this.showToast('Review processed and blocked.', 'error');
        }
      },
      error: () => {
        if (attempt < 20) {
          const timer = setTimeout(() => this.startProcessingPoll(reviewId, attempt + 1), 1500);
          this.processingPollTimers.set(reviewId, timer);
          return;
        }

        this.processingReviewIds.delete(reviewId);
        this.clearProcessingPoll(reviewId);
      },
    });
  }

  onBulkBlock(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.activeBulkAction = 'block';
    this.reviewService.bulkBlock(ids).subscribe({
      next: (blockedReviews) => {
        const blockedIds = new Set(blockedReviews.map((review) => review.id));
        this.reviews = this.reviews.map((review) => {
          const blockedReview = blockedReviews.find((item) => item.id === review.id);
          return blockedReview
            ? {
                ...review,
                ...blockedReview,
                isActive: false,
                pipelineStatus: 'blocked',
              }
            : review;
        });
        this.selectedIds.clear();
        this.applyFilters();
        this.loadSellerAnalytics();
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast(`${blockedIds.size} review(s) blocked.`, 'success');
      },
      error: () => {
        this.bulkLoading = false;
        this.activeBulkAction = null;
        this.showToast('Bulk block failed.', 'error');
      },
    });
  }

  onBlockReview(review: Review): void {
    this.reviewService.blockReview(review.id).subscribe({
      next: (blockedReview) => {
        this.reviews = this.reviews.map((item) => item.id === blockedReview.id
          ? {
              ...item,
              ...blockedReview,
              isActive: false,
              pipelineStatus: 'blocked',
              updatedAt: blockedReview.updatedAt ?? new Date().toISOString(),
            }
          : item
        );
        this.applyFilters();
        this.loadSellerAnalytics();
        this.showToast('Review blocked by super admin.', 'success');
      },
      error: () => {
        this.showToast('Failed to block review.', 'error');
      },
    });
  }

  private clearProcessingPoll(reviewId: string): void {
    const timer = this.processingPollTimers.get(reviewId);
    if (timer) {
      clearTimeout(timer);
      this.processingPollTimers.delete(reviewId);
    }
  }
}
