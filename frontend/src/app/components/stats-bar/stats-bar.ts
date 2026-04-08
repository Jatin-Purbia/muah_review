import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SiteCategoryReview } from '../../models/review.model';

@Component({
  selector: 'app-stats-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-bar.html',
  styleUrl: './stats-bar.scss',
})
export class StatsBarComponent {
  @Input() totalReviews = 0;
  @Input() publishedCount = 0;
  @Input() unpublishedCount = 0;
  @Input() averageRating = 0;
  @Input() ratingDistribution: { star: number; count: number }[] = [];
  @Input() categories: string[] = [];
  @Input() categoryStats: SiteCategoryReview[] = [];

  getBarWidth(count: number): string {
    if (!this.totalReviews) return '0%';
    return `${(count / this.totalReviews) * 100}%`;
  }

  stars(n: number): string[] {
    return Array(5).fill('').map((_, index) => (index < Math.round(n) ? '★' : '☆'));
  }

  get categoryDisplay(): { name: string; count: number; rating: number }[] {
    if (this.categoryStats.length > 0) {
      return this.categoryStats.map((item) => ({
        name: item.category,
        count: item.reviewerCount ?? 0,
        rating: item.rating ?? 0,
      }));
    }

    return this.categories.map((category) => ({ name: category, count: 0, rating: 0 }));
  }
}
