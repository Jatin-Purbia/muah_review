import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Review } from '../../models/review.model';

@Component({
  selector: 'app-review-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './review-card.html',
  styleUrl: './review-card.scss',
})
export class ReviewCardComponent {
  @Input() review!: Review;
  @Input() selected = false;
  @Input() processing = false;
  @Output() togglePublish = new EventEmitter<{ review: Review; published: boolean }>();
  @Output() blocked = new EventEmitter<Review>();
  @Output() deleted = new EventEmitter<Review>();
  @Output() selectionChange = new EventEmitter<boolean>();
  @Output() viewDetails = new EventEmitter<Review>();

  toggling = false;
  expanded = false;
  confirmDelete = false;
  confirmPublish = false;
  confirmBlock = false;

  get stars(): string[] {
    const rating = this.review.starRating ?? 0;
    return Array(5).fill('').map((_, index) => (index < rating ? '*' : 'o'));
  }

  get displayName(): string {
    return 'Customer';
  }

  get initials(): string {
    return 'C';
  }

  get categoryColor(): string {
    return '#3b82f6';
  }

  get commentNeedsExpansion(): boolean {
    return (this.review.description || '').length > 300;
  }

  get pipelineDisplay(): string {
    return this.review.pipelineScore !== undefined
      ? `${this.review.pipelineScore}`
      : this.review.pipelineStatus === 'approved'
        ? 'Approved'
        : this.review.pipelineStatus === 'manual-review'
          ? 'Manual Review'
          : this.review.pipelineStatus === 'blocked'
            ? 'Blocked'
            : 'Pending';
  }

  get statusLabel(): string {
    if (this.processing && this.review.pipelineStatus === 'pending') {
      return 'Processing';
    }

    if (this.review.isActive || this.review.pipelineStatus === 'approved') {
      return 'Published';
    }

    if (this.review.pipelineStatus === 'manual-review') {
      return 'Manual Review';
    }

    if (this.review.pipelineStatus === 'blocked') {
      return 'Blocked';
    }

    return 'Pending Review';
  }

  onToggle(): void {
    this.toggling = true;
    this.confirmPublish = false;
    this.togglePublish.emit({ review: this.review, published: !this.review.isActive });
    setTimeout(() => (this.toggling = false), 800);
  }

  toggleExpand(): void {
    this.expanded = !this.expanded;
  }

  onDelete(): void {
    this.deleted.emit(this.review);
    this.confirmDelete = false;
  }

  onBlock(): void {
    this.blocked.emit(this.review);
    this.confirmBlock = false;
  }

  onCardClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.menu-btn-group') || target.closest('.vote-btn')) {
      return;
    }
    this.viewDetails.emit(this.review);
  }
}
