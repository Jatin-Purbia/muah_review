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

  get customerTone(): 'positive' | 'mixed' | 'negative' | 'neutral' {
    const negativeCount = (this.review.segments ?? []).filter((segment) => segment.sentiment === 'negative').length;
    const positiveCount = (this.review.segments ?? []).filter((segment) => segment.sentiment === 'positive').length;
    const rating = this.review.starRating ?? 0;

    if (negativeCount > positiveCount || rating <= 2) {
      return 'negative';
    }

    if (positiveCount > 0 && negativeCount > 0) {
      return 'mixed';
    }

    if (positiveCount > 0 || rating >= 4) {
      return 'positive';
    }

    return 'neutral';
  }

  get customerToneLabel(): string {
    return this.customerTone === 'positive'
      ? 'Positive'
      : this.customerTone === 'mixed'
        ? 'Mixed'
        : this.customerTone === 'negative'
          ? 'Negative'
          : 'Neutral';
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
    return this.review.isActive
      ? 'What customers are saying'
      : this.review.pipelineStatus === 'blocked'
        ? 'Why this review may need a closer look'
        : 'What this review is mainly about';
  }

  get reviewSummaryTitle(): string {
    const topSegment = (this.review.segments ?? [])[0]?.segment?.trim();

    if (topSegment) {
      return topSegment;
    }

    if ((this.review.starRating ?? 0) >= 4) {
      return 'Positive product experience';
    }

    if ((this.review.starRating ?? 0) <= 2) {
      return 'Customer concern';
    }

    return 'General customer feedback';
  }

  get sellerActionHint(): string {
    if (this.review.isActive) {
      return 'Keep live if this reflects a fair customer experience.';
    }

    if (this.review.pipelineStatus === 'blocked') {
      return 'Read it carefully and decide if it should stay hidden or be addressed first.';
    }

    if (this.review.pipelineStatus === 'manual-review') {
      return 'Check the wording and publish if it feels fair and relevant.';
    }

    return 'Use your judgment after reading the full review.';
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
