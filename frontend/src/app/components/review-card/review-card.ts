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
  @Output() togglePublish = new EventEmitter<{ review: Review; published: boolean }>();
  @Output() liked = new EventEmitter<Review>();
  @Output() disliked = new EventEmitter<Review>();
  @Output() deleted = new EventEmitter<Review>();
  @Output() selectionChange = new EventEmitter<boolean>();

  toggling = false;
  liking = false;
  disliking = false;
  expanded = false;
  confirmDelete = false;

  localHelpful: number | null = null;
  localUnhelpful: number | null = null;

  get helpfulCount(): number {
    return this.localHelpful ?? this.review.helpfulCount;
  }

  get unhelpfulCount(): number {
    return this.localUnhelpful ?? this.review.unHelpfulCount;
  }

  get stars(): string[] {
    return Array(5).fill('').map((_, index) => (index < this.review.rating ? '★' : '☆'));
  }

  get displayName(): string {
    return this.review.creator?.fullName || this.review.nickName || this.review.customerName || 'Anonymous';
  }

  get initials(): string {
    return this.displayName
      .split(' ')
      .map((name) => name[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  get categoryColor(): string {
    const map: Record<string, string> = {
      product: '#f97316',
      products: '#f97316',
      service: '#0ea5e9',
      delivery: '#14b8a6',
      quality: '#8b5cf6',
      support: '#ec4899',
      general: '#64748b',
    };

    return map[(this.review.reviewCategory || '').toLowerCase()] || '#ea580c';
  }

  get commentNeedsExpansion(): boolean {
    return (this.review.comment || '').length > 200;
  }

  onToggle(): void {
    this.toggling = true;
    this.togglePublish.emit({ review: this.review, published: !this.review.isActive });
    setTimeout(() => (this.toggling = false), 800);
  }

  onLike(): void {
    if (this.liking || this.disliking) return;
    this.liking = true;
    this.localHelpful = this.helpfulCount + 1;
    this.liked.emit(this.review);
    setTimeout(() => (this.liking = false), 800);
  }

  onDislike(): void {
    if (this.liking || this.disliking) return;
    this.disliking = true;
    this.localUnhelpful = this.unhelpfulCount + 1;
    this.disliked.emit(this.review);
    setTimeout(() => (this.disliking = false), 800);
  }

  toggleExpand(): void {
    this.expanded = !this.expanded;
  }

  onDelete(): void {
    this.deleted.emit(this.review);
    this.confirmDelete = false;
  }
}
