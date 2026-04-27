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

  private readonly positiveTerms = [
    'love', 'great', 'good', 'excellent', 'amazing', 'happy', 'recommend', 'works', 'quality',
    'fast', 'easy', 'comfortable', 'premium', 'clean', 'balanced', 'secure', 'polished',
  ];

  private readonly negativeTerms = [
    'bad', 'poor', 'broken', 'fake', 'hate', 'slow', 'damaged', 'terrible', 'crushed',
    'disappointing', 'froze', 'unstable', 'struggled', 'strong', 'complaint', 'issue',
  ];

  private readonly cautionTerms = [
    'but', 'though', 'however', 'unsure', 'almost', 'expected', 'limited', 'missed',
  ];

  get stars(): string[] {
    const rating = this.review.starRating ?? 0;
    return Array(5).fill('').map((_, index) => (index < rating ? '*' : 'o'));
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

  get categoryReasonTitle(): string {
    return this.review.pipelineStatus === 'approved'
      ? 'Why it was approved'
      : this.review.pipelineStatus === 'manual-review'
        ? 'Why it needs manual review'
        : this.review.pipelineStatus === 'blocked'
          ? 'Why it was blocked'
          : 'Pipeline signals';
  }

  get highlightedKeywords(): { label: string; tone: 'good' | 'warn' | 'danger' }[] {
    const text = `${this.review.title ?? ''} ${this.review.description ?? ''}`.toLowerCase();
    const picked = new Map<string, 'good' | 'warn' | 'danger'>();

    const pickTerms = (terms: string[], tone: 'good' | 'warn' | 'danger') => {
      for (const term of terms) {
        if (text.includes(term)) {
          picked.set(term, tone);
        }
      }
    };

    if (this.review.pipelineStatus === 'approved') {
      pickTerms(this.positiveTerms, 'good');
      pickTerms(this.cautionTerms.slice(0, 2), 'warn');
    } else if (this.review.pipelineStatus === 'manual-review') {
      pickTerms(this.positiveTerms, 'good');
      pickTerms(this.cautionTerms, 'warn');
      pickTerms(this.negativeTerms.slice(0, 8), 'danger');
    } else if (this.review.pipelineStatus === 'blocked') {
      pickTerms(this.negativeTerms, 'danger');
      pickTerms(this.cautionTerms, 'warn');
    } else {
      pickTerms(this.positiveTerms.slice(0, 6), 'good');
      pickTerms(this.negativeTerms.slice(0, 6), 'danger');
      pickTerms(this.cautionTerms, 'warn');
    }

    if (picked.size === 0) {
      if (this.review.pipelineStatus === 'approved') {
        picked.set('positive tone', 'good');
      } else if (this.review.pipelineStatus === 'manual-review') {
        picked.set('mixed signals', 'warn');
      } else if (this.review.pipelineStatus === 'blocked') {
        picked.set('risk signals', 'danger');
      } else {
        picked.set('awaiting analysis', 'warn');
      }
    }

    return [...picked.entries()].slice(0, 6).map(([label, tone]) => ({ label, tone }));
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
