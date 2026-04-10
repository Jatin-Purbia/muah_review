import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Review } from '../../models/review.model';

@Component({
  selector: 'app-review-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './review-detail-modal.html',
  styleUrl: './review-detail-modal.scss',
})
export class ReviewDetailModalComponent {
  @Input() review!: Review;
  @Output() closed = new EventEmitter<void>();

  get stars(): string[] {
    const rating = this.review.starRating ?? 0;
    return Array(5).fill('').map((_, index) => (index < rating ? '★' : '☆'));
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closed.emit();
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
