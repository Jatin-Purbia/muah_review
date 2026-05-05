import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreateSiteReviewDto, ProductCatalogItem, REVIEW_CATEGORIES } from '../../models/review.model';

@Component({
  selector: 'app-add-review-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-review-modal.html',
  styleUrls: ['./add-review-modal.scss'],
})
export class AddReviewModalComponent implements OnChanges {
  @Input() products: ProductCatalogItem[] = [];
  @Input() selectedProductId: string | null = null;
  @Input() submitting = false;
  @Input() submitError = '';
  @Output() submitted = new EventEmitter<CreateSiteReviewDto>();
  @Output() cancelled = new EventEmitter<void>();

  form: CreateSiteReviewDto = {
    productId: '',
    sellerId: '',
    title: '',
    description: '',
    starRating: 0,
    category: '',
    media: [],
  };

  formError = '';
  hoverRating = 0;

  reviewCategories = REVIEW_CATEGORIES.map((category) => ({
    value: category,
    label: category,
  }));

  private readonly ratingLabels: Record<number, string> = {
    1: 'Poor',
    2: 'Below average',
    3: 'Average',
    4: 'Good',
    5: 'Excellent',
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductId'] || changes['products']) {
      this.applySelectedProduct(this.selectedProductId);
    }
  }

  get selectedProduct(): ProductCatalogItem | undefined {
    return this.products.find((product) => product.id === this.form.productId);
  }

  get isValid(): boolean {
    return (
      !!this.selectedProduct &&
      this.form.productId.trim().length > 0 &&
      this.form.sellerId.trim().length > 0 &&
      this.form.title.trim().length > 0 &&
      this.form.description.trim().length > 0 &&
      this.form.category.trim().length > 0 &&
      this.form.starRating >= 1 &&
      this.form.starRating <= 5
    );
  }

  get displayedRating(): number {
    return this.hoverRating || this.form.starRating;
  }

  get ratingLabel(): string {
    return this.ratingLabels[this.displayedRating] ?? '';
  }

  setRating(star: number): void {
    this.form.starRating = star;
  }

  selectCategory(value: string): void {
    this.form.category = value;
  }

  private applySelectedProduct(productId: string | null): void {
    const product = this.products.find((item) => item.id === productId);
    this.form.productId = product?.id ?? '';
    this.form.sellerId = product?.sellerId ?? '';
  }

  submit(): void {
    if (!this.isValid) {
      this.formError = 'Please start from a product card, fill in all fields, and select a rating.';
      return;
    }
    this.formError = '';
    this.submitted.emit({ ...this.form });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.cancelled.emit();
    }
  }
}
