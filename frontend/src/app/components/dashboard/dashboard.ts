import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService } from '../../services/review.service';
import { Review, CreateSiteReviewDto, PublishFilter, SiteCategoryReview, PipelineStatus } from '../../models/review.model';
import { ReviewCardComponent } from '../review-card/review-card';
import { StatsBarComponent } from '../stats-bar/stats-bar';
import { AddReviewModalComponent } from '../add-review-modal/add-review-modal';

type PortalView = 'super-admin' | 'seller';

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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReviewCardComponent, StatsBarComponent, AddReviewModalComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
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
  successMessage = '';

  selectedIds = new Set<string>();
  bulkLoading = false;

  activePortal: PortalView = 'super-admin';
  pipelineAutomationEnabled = true;
  automationThreshold = 72;
  selectedSellerId = 'seller-aurora';

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

  get sellerPublishedReviews(): Review[] {
    return this.sellerReviews.filter((review) => review.isActive);
  }

  get sellerFlaggedReviews(): Review[] {
    return this.sellerReviews.filter((review) => review.pipelineStatus !== 'approved');
  }

  get sellers(): SellerSummary[] {
    const groups = new Map<string, Review[]>();

    for (const review of this.reviews) {
      const sellerId = review.sellerId ?? 'unknown';
      const list = groups.get(sellerId) ?? [];
      list.push(review);
      groups.set(sellerId, list);
    }

    return [...groups.entries()].map(([sellerId, sellerReviews]) => {
      const totalReviews = sellerReviews.length;
      const publishedReviews = sellerReviews.filter((review) => review.isActive).length;
      const averageRating = totalReviews ? sellerReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews : 0;
      const positiveShare = totalReviews
        ? Math.round((sellerReviews.filter((review) => (review.sentimentScore ?? 0) >= 70).length / totalReviews) * 100)
        : 0;
      const satisfaction = totalReviews
        ? Math.round(sellerReviews.reduce((sum, review) => sum + (review.sentimentScore ?? 0), 0) / totalReviews)
        : 0;

      return {
        id: sellerId,
        name: sellerReviews[0]?.sellerName ?? 'Unknown seller',
        totalReviews,
        publishedReviews,
        averageRating,
        satisfaction,
        positiveShare,
      };
    });
  }

  get selectedSeller(): SellerSummary | undefined {
    return this.sellers.find((seller) => seller.id === this.selectedSellerId);
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

  get sellerMoodBars(): { label: string; value: number; tone: string }[] {
    const reviews = this.sellerReviews;
    const total = reviews.length || 1;

    return [
      { label: 'Happy', value: Math.round((reviews.filter((review) => (review.sentimentScore ?? 0) >= 70).length / total) * 100), tone: 'good' },
      { label: 'Mixed', value: Math.round((reviews.filter((review) => (review.sentimentScore ?? 0) >= 45 && (review.sentimentScore ?? 0) < 70).length / total) * 100), tone: 'warn' },
      { label: 'Unhappy', value: Math.round((reviews.filter((review) => (review.sentimentScore ?? 0) < 45).length / total) * 100), tone: 'danger' },
    ];
  }

  get sellerCategoryPerformance(): { category: string; rating: number; mentions: number }[] {
    const categoryMap = new Map<string, Review[]>();

    for (const review of this.sellerReviews) {
      const list = categoryMap.get(review.reviewCategory) ?? [];
      list.push(review);
      categoryMap.set(review.reviewCategory, list);
    }

    return [...categoryMap.entries()].map(([category, reviews]) => ({
      category,
      rating: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
      mentions: reviews.length,
    }));
  }

  get sellerTrend(): { month: string; score: number }[] {
    return [
      { month: 'Jan', score: 62 },
      { month: 'Feb', score: 68 },
      { month: 'Mar', score: 74 },
      { month: 'Apr', score: this.selectedSeller?.satisfaction ?? 70 },
    ];
  }

  get sellerTopSignals(): { title: string; body: string; tone: 'good' | 'warn' | 'danger' }[] {
    const topNegative = this.sellerFlaggedReviews[0];
    const topPositive = [...this.sellerReviews].sort((a, b) => (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0))[0];

    return [
      {
        title: 'What customers love',
        body: topPositive ? `${topPositive.productName}: strongest signal around ${topPositive.segments?.[0]?.segment?.toLowerCase() ?? 'overall product quality'}.` : 'Positive product sentiment is trending up.',
        tone: 'good',
      },
      {
        title: 'What needs work',
        body: topNegative ? `${topNegative.productName}: pipeline flagged concerns around ${topNegative.segments?.find((segment) => segment.sentiment === 'negative')?.segment?.toLowerCase() ?? 'review sentiment'}.` : 'No major risks in the current seller queue.',
        tone: topNegative ? 'danger' : 'warn',
      },
      {
        title: 'Action recommendation',
        body: 'Use this dashboard to compare category sentiment, identify weak spots, and coordinate with support or operations before publishing more reviews.',
        tone: 'warn',
      },
    ];
  }

  constructor(private reviewService: ReviewService) {}

  ngOnInit(): void {
    this.loadReviews();
    this.loadStatistics();
  }

  loadStatistics(): void {
    this.reviewService.getStatistics().subscribe({
      next: (data) => { this.categoryStats = (data || []).filter((stat) => !!stat.category); },
      error: () => { /* non-critical */ },
    });
  }

  loadReviews(): void {
    this.loading = true;
    this.error = '';
    this.reviewService.getReviews().subscribe({
      next: (data) => {
        this.reviews = data;
        if (!this.sellers.find((seller) => seller.id === this.selectedSellerId) && this.sellers[0]) {
          this.selectedSellerId = this.sellers[0].id;
        }
        this.applyFilters();
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
        (review.heading || '').toLowerCase().includes(query) ||
        review.comment.toLowerCase().includes(query) ||
        (review.nickName || '').toLowerCase().includes(query) ||
        (review.customerName || '').toLowerCase().includes(query) ||
        (review.creator?.fullName || '').toLowerCase().includes(query) ||
        (review.sellerName || '').toLowerCase().includes(query) ||
        (review.productName || '').toLowerCase().includes(query)
      );
    }

    const activeCategory = this.selectedCategoryKey ?? this.selectedCategory;
    if (activeCategory) {
      result = result.filter((review) => review.reviewCategory?.toLowerCase() === activeCategory.toLowerCase());
    }

    if (this.selectedRating > 0) {
      const star = Number(this.selectedRating);
      result = result.filter((review) => review.rating === star);
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

  get categories(): string[] {
    return [...new Set(this.reviews.map((review) => review.reviewCategory).filter(Boolean))];
  }

  get averageRating(): number {
    if (!this.reviews.length) return 0;
    return this.reviews.reduce((sum, review) => sum + review.rating, 0) / this.reviews.length;
  }

  get ratingDistribution(): { star: number; count: number }[] {
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: this.reviews.filter((review) => review.rating === star).length,
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
        const index = this.reviews.findIndex((review) => review.id === event.review.id);
        if (index !== -1) {
          this.reviews[index] = {
            ...this.reviews[index],
            isActive: response.isActive,
            pipelineStatus: response.isActive ? 'approved' : 'manual-review',
          };
        }
        this.applyFilters();
        this.successMessage = response.isActive ? 'Review published to website.' : 'Review moved back to moderation.';
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: () => {
        this.error = 'Failed to update publish state.';
        setTimeout(() => (this.error = ''), 3000);
      },
    });
  }

  onLike(review: Review): void {
    this.reviewService.markHelpful(review.id).subscribe({ error: () => {} });
  }

  onDislike(review: Review): void {
    this.reviewService.markUnhelpful(review.id).subscribe({ error: () => {} });
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
  }

  onBulkPublish(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.reviewService.bulkPublish(ids).subscribe({
      next: (results) => {
        results.forEach((result) => {
          const index = this.reviews.findIndex((review) => review.id === result.id);
          if (index !== -1) {
            this.reviews[index] = { ...this.reviews[index], isActive: true, pipelineStatus: 'approved' };
          }
        });
        this.selectedIds.clear();
        this.applyFilters();
        this.bulkLoading = false;
        this.successMessage = `${ids.length} review(s) published.`;
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: () => {
        this.error = 'Bulk publish failed.';
        this.bulkLoading = false;
        setTimeout(() => (this.error = ''), 4000);
      },
    });
  }

  onBulkUnpublish(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.reviewService.bulkUnpublish(ids).subscribe({
      next: (results) => {
        results.forEach((result) => {
          const index = this.reviews.findIndex((review) => review.id === result.id);
          if (index !== -1) {
            this.reviews[index] = { ...this.reviews[index], isActive: false, pipelineStatus: 'manual-review' };
          }
        });
        this.selectedIds.clear();
        this.applyFilters();
        this.bulkLoading = false;
        this.successMessage = `${ids.length} review(s) moved to moderation.`;
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: () => {
        this.error = 'Bulk unpublish failed.';
        this.bulkLoading = false;
        setTimeout(() => (this.error = ''), 4000);
      },
    });
  }

  onBulkDelete(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.reviewService.bulkDelete(ids).subscribe({
      next: () => {
        this.reviews = this.reviews.filter((review) => !ids.includes(review.id));
        this.selectedIds.clear();
        this.applyFilters();
        this.bulkLoading = false;
        this.successMessage = `${ids.length} review(s) deleted.`;
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: () => {
        this.error = 'Bulk delete failed.';
        this.bulkLoading = false;
        setTimeout(() => (this.error = ''), 4000);
      },
    });
  }

  onDelete(review: Review): void {
    this.reviewService.deleteReview(review.id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter((item) => item.id !== review.id);
        this.applyFilters();
        this.successMessage = 'Review deleted.';
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: () => {
        this.error = 'Failed to delete review.';
        setTimeout(() => (this.error = ''), 4000);
      },
    });
  }

  onReviewSubmitted(dto: CreateSiteReviewDto): void {
    this.showModal = false;
    this.reviewService.createReview(dto).subscribe({
      next: () => {
        this.successMessage = 'Review submitted successfully.';
        this.loadReviews();
        setTimeout(() => (this.successMessage = ''), 3500);
      },
      error: () => {
        this.error = 'Failed to submit review. Please try again.';
        setTimeout(() => (this.error = ''), 5000);
      },
    });
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
}
