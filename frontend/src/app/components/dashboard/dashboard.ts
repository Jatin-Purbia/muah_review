import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService, ReviewStatusCounts } from '../../services/review.service';
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

interface DashboardStat {
  value: string;
  label: string;
  tone?: 'default' | 'gold' | 'green';
}

interface ReviewPager {
  totalItems: number;
  currentPage: number;
  numberPerPage: number;
  totalPages: number;
}

interface ReviewSummaryState {
  total_reviews: number;
  published_count: number;
  unpublished_count: number;
  moderation_count: number;
  blocked_count: number;
  average_rating: number;
  rating_distribution: { star: number; count: number }[];
  category_stats: SiteCategoryReview[];
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
  sellerPortalReviews: Review[] = [];
  queueReviews: Review[] = [];
  filteredReviews: Review[] = [];
  categoryStats: SiteCategoryReview[] = [];
  reviewPager: ReviewPager = { totalItems: 0, currentPage: 1, numberPerPage: 12, totalPages: 1 };
  sellerReviewPager: ReviewPager = { totalItems: 0, currentPage: 1, numberPerPage: 12, totalPages: 1 };
  reviewSummary: ReviewSummaryState = {
    total_reviews: 0,
    published_count: 0,
    unpublished_count: 0,
    moderation_count: 0,
    blocked_count: 0,
    average_rating: 0,
    rating_distribution: [],
    category_stats: [],
  };
  statusCounts: ReviewStatusCounts | null = null;
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
  adminReviewPage = 1;
  sellerReviewPage = 1;
  sellerSelectedCategory: string | null = null;
  readonly reviewPageSize = 12;
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
  sellerDropdownOpen = false;

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
    return this.sellerPortalReviews;
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

  get adminReviewTotalPages(): number {
    return this.reviewPager.totalPages;
  }

  get pagedFilteredReviews(): Review[] {
    return this.filteredReviews;
  }

  get adminReviewRangeStart(): number {
    return this.reviewPager.totalItems ? (this.reviewPager.currentPage - 1) * this.reviewPager.numberPerPage + 1 : 0;
  }

  get adminReviewRangeEnd(): number {
    return Math.min(this.reviewPager.currentPage * this.reviewPager.numberPerPage, this.reviewPager.totalItems);
  }

  get sellerReviewTotalPages(): number {
    return this.sellerReviewPager.totalPages;
  }

  get pagedSellerReviews(): Review[] {
    return this.sellerReviews;
  }

  get sellerReviewRangeStart(): number {
    return this.sellerReviewPager.totalItems ? (this.sellerReviewPager.currentPage - 1) * this.sellerReviewPager.numberPerPage + 1 : 0;
  }

  get sellerReviewRangeEnd(): number {
    return Math.min(this.sellerReviewPager.currentPage * this.sellerReviewPager.numberPerPage, this.sellerReviewPager.totalItems);
  }

  get sellerPublishedReviews(): Review[] {
    return this.sellerReviews.filter((review) => review.isActive);
  }

  get sellerPublishedCount(): number {
    return this.sellerAnalytics?.published_reviews ?? this.sellerPublishedReviews.length;
  }

  get sellerFlaggedReviews(): Review[] {
    return this.sellerReviews.filter((review) => review.pipelineStatus !== 'approved');
  }

  get sellerPendingCount(): number {
    return this.sellerAnalytics?.pending_reviews ?? this.sellerFlaggedReviews.length;
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
      const totalReviews = sellerProducts.reduce((sum, product) => sum + (product.reviewCount ?? 0), 0);
      const weightedRatingTotal = sellerProducts.reduce((sum, product) => sum + ((product.reviewAvg ?? 0) * (product.reviewCount ?? 0)), 0);
      const averageRating = totalReviews ? weightedRatingTotal / totalReviews : 0;
      const publishedReviews = sellerReviews.filter((review) => review.isActive).length;
      const positiveShare = 0;
      const satisfaction = Math.round(averageRating * 20);

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

  get isSellerPortal(): boolean {
    return this.activePortal === 'seller';
  }

  get dashboardTitle(): string {
    return this.isSellerPortal
      ? `${this.selectedSeller?.name ?? 'Seller'} review workspace`
      : 'Review Intelligence Hub';
  }

  get dashboardSubtitle(): string {
    return this.isSellerPortal
      ? 'Track what customers are saying about your products in one place.'
      : 'Moderation and seller performance dashboard.';
  }

  get headerStats(): DashboardStat[] {
    if (this.isSellerPortal) {
      return [
        { value: `${this.sellerReviewPager.totalItems}`, label: 'Your Reviews' },
        { value: this.sellerAverageRatingDisplay, label: 'Your Rating', tone: 'gold' },
        { value: `${this.sellerPublishedCount}`, label: 'Live Reviews', tone: 'green' },
      ];
    }

    return [
      { value: `${this.reviewSummary.total_reviews}`, label: 'Total Reviews' },
      { value: `${this.averageRating.toFixed(1)}★`, label: 'Network Rating', tone: 'gold' },
      { value: `${this.sellers.length}`, label: 'Active Sellers', tone: 'green' },
    ];
  }

  get sellerAverageRatingDisplay(): string {
    return `${(this.selectedSeller?.averageRating ?? 0).toFixed(1)}★`;
  }

  get heroEyebrow(): string {
    return this.isSellerPortal ? 'Seller view' : 'Overview';
  }

  get heroTitle(): string {
    return this.isSellerPortal
      ? `${this.selectedSeller?.name ?? 'Seller'} review dashboard`
      : 'Review moderation dashboard';
  }

  get heroDescription(): string {
    return this.isSellerPortal
      ? 'See the reviews tied to this seller, understand customer tone, and follow what is currently live or waiting on admin review.'
      : 'Monitor pipeline health, manage publishing, and review seller performance in one place.';
  }

  get heroHighlights(): DashboardStat[] {
    if (this.isSellerPortal) {
      return [
        { value: `${this.sellerReviewPager.totalItems}`, label: 'total reviews' },
        { value: `${this.sellerPendingCount}`, label: 'awaiting admin review' },
        { value: `${this.sellerPublishedCount}`, label: 'live on store' },
      ];
    }

    return [
      { value: `${this.products.length}`, label: 'catalog products' },
      { value: `${this.moderationCount}`, label: 'needs review' },
      { value: `${this.publishedCount}`, label: 'published live' },
    ];
  }

  get liveModeLabel(): string {
    return this.isSellerPortal ? 'Seller workspace' : 'Operations console';
  }

  get pipelineMetrics(): PipelineMetric[] {
    const totalPublished = this.reviewSummary.published_count;
    const approved = totalPublished;
    const manualReview = this.reviewSummary.moderation_count;
    const blocked = this.reviewSummary.blocked_count;

    return [
      { label: 'Auto-approved', value: `${approved}`, note: `${totalPublished} live on website`, tone: 'good' },
      { label: 'Manual queue', value: `${manualReview}`, note: 'Needs super admin review', tone: manualReview > 0 ? 'warn' : 'default' },
      { label: 'Blocked', value: `${blocked}`, note: 'Held back from website', tone: blocked > 0 ? 'danger' : 'default' },
    ];
  }

  get pendingPipelineReviews(): Review[] {
    return this.queueReviews;
  }

  get categoryTabs(): CategoryTabStat[] {
    return this.categoryStats.map((stat, index) => {
      return {
        id: `fallback-${index}`,
        category: stat.category,
        reviewerCount: stat.reviewerCount ?? 0,
        rating: stat.rating ?? 0,
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
      { label: 'Happy', value: Math.round((reviews.filter((review) => (review.starRating ?? 0) >= 4).length / total) * 100), tone: 'good' },
      { label: 'Mixed', value: Math.round((reviews.filter((review) => (review.starRating ?? 0) === 3).length / total) * 100), tone: 'warn' },
      { label: 'Unhappy', value: Math.round((reviews.filter((review) => (review.starRating ?? 0) <= 2).length / total) * 100), tone: 'danger' },
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

  get sellerStatusCards(): { title: string; body: string; tone: 'good' | 'warn' | 'danger' }[] {
    const pending = this.sellerPendingCount;
    const flagged = this.sellerAnalytics?.flagged_reviews ?? this.sellerReviews.filter((review) => review.pipelineStatus === 'blocked').length;
    const live = this.sellerAnalytics?.published_reviews ?? this.sellerPublishedReviews.length;
    const cards: { title: string; body: string; tone: 'good' | 'warn' | 'danger' }[] = [
      {
        title: 'Live on store',
        body: `${live} review(s) are currently visible to shoppers.`,
        tone: live > 0 ? 'good' : 'warn',
      },
      {
        title: 'Waiting on admin',
        body: `${pending} review(s) are still in admin review before they can go live.`,
        tone: pending > 0 ? 'warn' : 'good',
      },
    ];

    if (flagged > 0) {
      cards.push({
        title: 'Held back',
        body: `${flagged} review(s) are currently blocked by moderation.`,
        tone: 'danger',
      });
    }

    return cards;
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
    this.loadReviewSummary();
    this.loadQueueReviews();
    this.loadReviews();
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
    this.categoryStats = (this.reviewSummary.category_stats || []).filter((stat) => !!stat.category);
  }

  toggleSellerDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.sellerDropdownOpen = !this.sellerDropdownOpen;
  }

  selectSeller(id: string): void {
    if (id !== this.selectedSellerId) {
      this.selectedSellerId = id;
      this.sellerReviewPage = 1;
      this.sellerSelectedCategory = null;
      this.loadSellerAnalytics();
    }
    this.sellerDropdownOpen = false;
  }

  selectSellerCategory(category: string | null): void {
    const next = category ? category : null;
    if (this.sellerSelectedCategory === next) {
      return;
    }
    this.sellerSelectedCategory = next;
    this.sellerReviewPage = 1;
    this.loadSellerPortalReviews();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.sellerDropdownOpen) {
      this.sellerDropdownOpen = false;
    }
  }

  loadSellerAnalytics(): void {
    if (!this.selectedSellerId) {
      return;
    }
    this.sellerAnalytics = null;
    this.sellerTrends = [];
    this.sellerAspects = [];
    this.sellerPortalReviews = [];
    this.sellerReviewPager = { totalItems: 0, currentPage: this.sellerReviewPage, numberPerPage: this.reviewPageSize, totalPages: 1 };
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
    this.loadSellerPortalReviews();
  }

  loadSellerPortalReviews(): void {
    if (!this.selectedSellerId) {
      this.sellerPortalReviews = [];
      return;
    }
    this.reviewService.getSellerReviews(this.selectedSellerId, this.sellerReviewPage, this.reviewPageSize, this.sellerSelectedCategory).subscribe({
      next: (payload) => {
        this.sellerPortalReviews = payload.reviews;
        this.sellerReviewPager = payload.pager;
      },
      error: () => {
        this.sellerPortalReviews = [];
        this.sellerReviewPager = { totalItems: 0, currentPage: this.sellerReviewPage, numberPerPage: this.reviewPageSize, totalPages: 1 };
      },
    });
  }

  loadReviews(): void {
    this.loading = true;
    this.error = '';
    this.reviewService.getReviewsPage({
      page: this.adminReviewPage,
      pageSize: this.reviewPageSize,
      status: this.publishFilter,
      search: this.searchQuery,
      rating: this.selectedRating,
      category: this.selectedCategoryKey,
    }).subscribe({
      next: (payload) => {
        this.reviews = payload.reviews;
        this.filteredReviews = payload.reviews;
        this.reviewPager = payload.pager;
        if (payload.statusCounts) {
          this.statusCounts = payload.statusCounts;
        }
        const loadedIds = new Set(payload.reviews.map((review) => review.id));
        for (const reviewId of [...this.processingReviewIds]) {
          if (!loadedIds.has(reviewId)) {
            this.processingReviewIds.delete(reviewId);
            this.clearProcessingPoll(reviewId);
          }
        }
        if (!this.sellers.find((seller) => seller.id === this.selectedSellerId) && this.sellers[0]) {
          this.selectedSellerId = this.sellers[0].id;
        }
        this.loadSellerAnalytics();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load reviews. Please try again.';
        this.loading = false;
      },
    });
  }

  loadReviewSummary(): void {
    this.reviewService.getReviewSummary().subscribe({
      next: (summary) => {
        this.reviewSummary = {
          total_reviews: summary.total_reviews ?? 0,
          published_count: summary.published_count ?? 0,
          unpublished_count: summary.unpublished_count ?? 0,
          moderation_count: summary.moderation_count ?? 0,
          blocked_count: summary.blocked_count ?? 0,
          average_rating: summary.average_rating ?? 0,
          rating_distribution: summary.rating_distribution ?? [],
          category_stats: summary.category_stats ?? [],
        };
        this.categoryStats = (summary.category_stats || []).filter((stat) => !!stat.category);
      },
      error: () => {
        this.reviewSummary = {
          total_reviews: 0,
          published_count: 0,
          unpublished_count: 0,
          moderation_count: 0,
          blocked_count: 0,
          average_rating: 0,
          rating_distribution: [],
          category_stats: [],
        };
        this.categoryStats = [];
      },
    });
  }

  applyFilters(): void {
    this.loadReviews();
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
    this.adminReviewPage = 1;
    this.applyFilters();
  }

  setPublishFilter(filter: PublishFilter): void {
    this.publishFilter = filter;
    this.adminReviewPage = 1;
    this.applyFilters();
  }

  isSelected(id: string): boolean { return this.selectedIds.has(id); }

  private get useScopedCounts(): boolean {
    return !!this.selectedCategoryKey && this.statusCounts !== null;
  }
  get totalReviewCount(): number {
    return this.useScopedCounts ? this.statusCounts!.total : this.reviewSummary.total_reviews;
  }
  get publishedCount(): number {
    return this.useScopedCounts ? this.statusCounts!.published : this.reviewSummary.published_count;
  }
  get unpublishedCount(): number { return this.reviewSummary.unpublished_count; }
  get moderationCount(): number {
    return this.useScopedCounts ? this.statusCounts!.moderation : this.reviewSummary.moderation_count;
  }
  get blockedCount(): number {
    return this.useScopedCounts ? this.statusCounts!.blocked : this.reviewSummary.blocked_count;
  }
  get needsActionCount(): number {
    return this.reviewSummary.unpublished_count;
  }

  get categories(): string[] {
    return this.categoryStats.map((stat) => stat.category);
  }

  get averageRating(): number {
    return this.reviewSummary.average_rating;
  }

  get ratingDistribution(): { star: number; count: number }[] {
    return this.reviewSummary.rating_distribution;
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.selectedCategoryKey = null;
    this.selectedRating = 0;
    this.publishFilter = 'all';
    this.adminReviewPage = 1;
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
        this.loadReviews();
        this.loadReviewSummary();
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
      this.pagedFilteredReviews.forEach((review) => this.selectedIds.delete(review.id));
    } else {
      this.pagedFilteredReviews.forEach((review) => this.selectedIds.add(review.id));
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
        this.loadReviewSummary();
        this.loadQueueReviews();
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
        this.loadReviewSummary();
        this.loadQueueReviews();
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
        this.loadReviewSummary();
        this.loadQueueReviews();
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
        this.loadReviews();
        this.loadReviewSummary();
        this.loadQueueReviews();
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
        this.loadReviewSummary();
        this.loadSellerAnalytics();

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

  previousAdminReviewPage(): void {
    if (this.adminReviewPage > 1) {
      this.adminReviewPage -= 1;
      this.clearSelection();
      this.loadReviews();
    }
  }

  nextAdminReviewPage(): void {
    if (this.adminReviewPage < this.adminReviewTotalPages) {
      this.adminReviewPage += 1;
      this.clearSelection();
      this.loadReviews();
    }
  }

  previousSellerReviewPage(): void {
    if (this.sellerReviewPage > 1) {
      this.sellerReviewPage -= 1;
      this.loadSellerPortalReviews();
    }
  }

  nextSellerReviewPage(): void {
    if (this.sellerReviewPage < this.sellerReviewTotalPages) {
      this.sellerReviewPage += 1;
      this.loadSellerPortalReviews();
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
        this.loadReviews();
        this.loadReviewSummary();
        this.loadQueueReviews();
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
        this.loadReviews();
        this.loadReviewSummary();
        this.loadQueueReviews();
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

  private loadQueueReviews(): void {
    this.reviewService.getReviewQueue().subscribe({
      next: (reviews) => { this.queueReviews = reviews; },
      error: () => { this.queueReviews = []; },
    });
  }
}
