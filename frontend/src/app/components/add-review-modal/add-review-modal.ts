import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreateSiteReviewDto } from '../../models/review.model';

@Component({
  selector: 'app-add-review-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-review-modal.html',
  styleUrl: './add-review-modal.scss',
})
export class AddReviewModalComponent {
  @Output() submitted = new EventEmitter<CreateSiteReviewDto>();
  @Output() cancelled = new EventEmitter<void>();

  form: CreateSiteReviewDto = {
    title: '',
    description: '',
    starRating: 0,
    media: [],
  };

  submitting = false;
  formError = '';
  hoverRating = 0;

  get isValid(): boolean {
    return (
      this.form.title.trim().length > 0 &&
      this.form.description.trim().length > 0 &&
      this.form.starRating >= 1 &&
      this.form.starRating <= 5
    );
  }

  setRating(star: number): void {
    this.form.starRating = star;
  }

  submit(): void {
    if (!this.isValid) {
      this.formError = 'Please fill in all fields and select a rating.';
      return;
    }
    this.formError = '';
    this.submitting = true;
    this.submitted.emit({ ...this.form });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.cancelled.emit();
    }
  }
}
