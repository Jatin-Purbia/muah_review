import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService } from '../../services/review.service';
import { Review, CreateSiteReviewDto, PublishFilter, SiteCategoryReview } from '../../models/review.model';
import { ReviewCardComponent } from '../review-card/review-card';
import { StatsBarComponent } from '../stats-bar/stats-bar';
import { AddReviewModalComponent } from '../add-review-modal/add-review-modal';

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

  // Bulk selection
  selectedIds = new Set<string>();
  bulkLoading = false;

  get someSelected(): boolean { return this.selectedIds.size > 0; }
  get selectedCount(): number { return this.selectedIds.size; }
  get selectedIdsArray(): string[] { return [...this.selectedIds]; }

  get allSelected(): boolean {
    return this.filteredReviews.length > 0 &&
      this.filteredReviews.every((r) => this.selectedIds.has(r.id));
  }

  isSelected(id: string): boolean { return this.selectedIds.has(id); }

  constructor(private reviewService: ReviewService) {}

  ngOnInit(): void {
    this.loadReviews();
    this.loadStatistics();
  }

  loadStatistics(): void {
    this.reviewService.getStatistics().subscribe({
      next: (data) => { this.categoryStats = (data || []).filter((s) => !!s.category); },
      error: () => { /* non-critical */ },
    });
  }

  loadReviews(): void {
    this.loading = true;
    this.error = '';
    this.reviewService.getReviews().subscribe({
      next: (data) => {
        this.reviews = data;
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
      result = result.filter((r) => r.isActive);
    } else if (this.publishFilter === 'unpublished') {
      result = result.filter((r) => !r.isActive);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.heading || '').toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q) ||
          (r.nickName || '').toLowerCase().includes(q) ||
          (r.customerName || '').toLowerCase().includes(q) ||
          (r.creator?.fullName || '').toLowerCase().includes(q)
      );
    }

    const activeCat = this.selectedCategoryKey ?? this.selectedCategory;
    if (activeCat) {
      result = result.filter((r) => r.reviewCategory?.toLowerCase() === activeCat.toLowerCase());
    }

    if (this.selectedRating > 0) {
      const star = Number(this.selectedRating);
      result = result.filter((r) => r.rating === star);
    }

    this.filteredReviews = result;
  }

  selectCategoryKey(key: string | null): void {
    this.selectedCategoryKey = key ? key.toLowerCase() : null;
    this.selectedCategory = '';
    this.applyFilters();
  }

  setPublishFilter(f: PublishFilter): void {
    this.publishFilter = f;
    this.applyFilters();
  }

  get publishedCount(): number { return this.reviews.filter((r) => r.isActive).length; }
  get unpublishedCount(): number { return this.reviews.filter((r) => !r.isActive).length; }

  get categories(): string[] {
    return [...new Set(this.reviews.map((r) => r.reviewCategory).filter(Boolean))];
  }

  get averageRating(): number {
    if (!this.reviews.length) return 0;
    return this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length;
  }

  get ratingDistribution(): { star: number; count: number }[] {
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: this.reviews.filter((r) => r.rating === star).length,
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
      next: (res) => {
        const idx = this.reviews.findIndex((r) => r.id === event.review.id);
        if (idx !== -1) {
          this.reviews[idx] = { ...this.reviews[idx], isActive: res.isActive };
        }
        this.applyFilters();
        this.successMessage = res.isActive ? 'Review published.' : 'Review unpublished.';
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

  // Bulk operations

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.filteredReviews.forEach((r) => this.selectedIds.delete(r.id));
    } else {
      this.filteredReviews.forEach((r) => this.selectedIds.add(r.id));
    }
  }

  toggleSelectOne(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  clearSelection(): void { this.selectedIds.clear(); }

  onBulkPublish(): void {
    const ids = this.selectedIdsArray;
    this.bulkLoading = true;
    this.reviewService.bulkPublish(ids).subscribe({
      next: (results) => {
        results.forEach((res) => {
          const idx = this.reviews.findIndex((r) => r.id === res.id);
          if (idx !== -1) this.reviews[idx] = { ...this.reviews[idx], isActive: true };
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
        results.forEach((res) => {
          const idx = this.reviews.findIndex((r) => r.id === res.id);
          if (idx !== -1) this.reviews[idx] = { ...this.reviews[idx], isActive: false };
        });
        this.selectedIds.clear();
        this.applyFilters();
        this.bulkLoading = false;
        this.successMessage = `${ids.length} review(s) moved to drafts.`;
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
        this.reviews = this.reviews.filter((r) => !ids.includes(r.id));
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
        this.reviews = this.reviews.filter((r) => r.id !== review.id);
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
        this.successMessage = 'Review submitted successfully!';
        this.loadReviews();
        setTimeout(() => (this.successMessage = ''), 3500);
      },
      error: () => {
        this.error = 'Failed to submit review. Please try again.';
        setTimeout(() => (this.error = ''), 5000);
      },
    });
  }
}
