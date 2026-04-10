import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  Review,
  CreateSiteReviewDto,
  SiteReviewFilter,
  SiteReviewSearchResult,
  SiteCategoryReview,
  RatingBreakdown,
  RATING_CONFIG,
} from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private mockReviews: Review[] = [
    {
      id: '1',
      userId: 'user-001',
      title: 'Delivery felt premium and fast',
      description: 'My order arrived in two days, the packaging was secure, and the tracking updates were clear the whole way through. It felt like a polished premium brand experience.',
      starRating: 5,
      helpfulCount: 24,
      unHelpfulCount: 1,
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: null,
      sellerId: 'seller-aurora',
      sellerName: 'Aurora Beauty',
      productName: 'Glow Serum',
      pipelineScore: 91,
      sentimentScore: 88,
      pipelineStatus: 'approved',
      autoPublishEligible: true,
      media: [
        { id: 'media-1', type: 'image', url: 'https://via.placeholder.com/400x300?text=Glow+Serum' }
      ],
    },
    {
      id: '2',
      userId: 'user-002',
      title: 'Support team guided me before buying',
      description: 'I asked a few ingredient questions and the support team replied quickly with a simple routine recommendation. It made me much more confident about placing the order.',
      starRating: 5,
      helpfulCount: 18,
      unHelpfulCount: 0,
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-14T14:20:00Z',
      updatedAt: null,
      sellerId: 'seller-aurora',
      sellerName: 'Aurora Beauty',
      productName: 'Starter Routine Bundle',
      pipelineScore: 89,
      sentimentScore: 92,
      pipelineStatus: 'approved',
      autoPublishEligible: true,
    },
    {
      id: '3',
      userId: 'user-003',
      title: 'Comfortable fabric and clean stitching',
      description: 'The polo feels soft, breathable, and comfortable for all-day wear. It looks sharp enough for casual office days and still feels easy on weekends.',
      starRating: 5,
      helpfulCount: 12,
      unHelpfulCount: 2,
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-13T09:15:00Z',
      updatedAt: null,
      sellerId: 'seller-threadline',
      sellerName: 'ThreadLine Apparel',
      productName: 'Polo Top',
      pipelineScore: 86,
      sentimentScore: 84,
      pipelineStatus: 'approved',
      autoPublishEligible: true,
      media: [
        { id: 'media-3', type: 'image', url: 'https://via.placeholder.com/400x300?text=Polo+Top' }
      ],
    },
    {
      id: '4',
      userId: 'user-004',
      title: 'Works well but scent is a bit strong',
      description: 'The cleanser leaves my skin balanced and clean, but the fragrance is stronger than I expected. I would still use it, though I am unsure whether that scent will appeal to everyone.',
      starRating: 3,
      helpfulCount: 8,
      unHelpfulCount: 4,
      isActive: false,
      isDeleted: false,
      createdAt: '2024-03-12T16:45:00Z',
      updatedAt: null,
      sellerId: 'seller-aurora',
      sellerName: 'Aurora Beauty',
      productName: 'Daily Cleanser',
      pipelineScore: 58,
      sentimentScore: 46,
      pipelineStatus: 'manual-review',
      autoPublishEligible: false,
    },
    {
      id: '5',
      userId: 'user-005',
      title: 'Shade range missed my undertone',
      description: 'The finish is beautiful, but I struggled to find a match that works for my undertone. The product quality seems good, though the current options feel limited for me.',
      starRating: 2,
      helpfulCount: 5,
      unHelpfulCount: 8,
      isActive: false,
      isDeleted: false,
      createdAt: '2024-03-11T11:00:00Z',
      updatedAt: null,
      sellerId: 'seller-aurora',
      sellerName: 'Aurora Beauty',
      productName: 'Skin Tint',
      pipelineScore: 34,
      sentimentScore: 22,
      pipelineStatus: 'blocked',
      autoPublishEligible: false,
    },
    {
      id: '6',
      userId: 'user-006',
      title: 'Returns process was easier than expected',
      description: 'I had to exchange a size and the process was straightforward. The portal was easy to use and the replacement arrived quickly after the return was picked up.',
      starRating: 4,
      helpfulCount: 11,
      unHelpfulCount: 1,
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-10T13:30:00Z',
      updatedAt: null,
      sellerId: 'seller-threadline',
      sellerName: 'ThreadLine Apparel',
      productName: 'Linen Shirt',
      pipelineScore: 77,
      sentimentScore: 71,
      pipelineStatus: 'approved',
      autoPublishEligible: true,
    },
    {
      id: '7',
      userId: 'user-007',
      title: 'Website felt slow on mobile checkout',
      description: 'The product itself is good, but the mobile checkout froze twice before the payment finally went through. I almost gave up because the experience felt unstable.',
      starRating: 2,
      helpfulCount: 15,
      unHelpfulCount: 2,
      isActive: false,
      isDeleted: false,
      createdAt: '2024-03-09T10:00:00Z',
      updatedAt: null,
      sellerId: 'seller-threadline',
      sellerName: 'ThreadLine Apparel',
      productName: 'Mobile Storefront',
      pipelineScore: 41,
      sentimentScore: 27,
      pipelineStatus: 'manual-review',
      autoPublishEligible: false,
    },
    {
      id: '8',
      userId: 'user-008',
      title: 'Happy with the item, disappointed by packaging damage',
      description: 'The dress looks great and fits well, but the outer box was crushed when it arrived. Thankfully the product was fine, though the unboxing experience was disappointing.',
      starRating: 3,
      helpfulCount: 9,
      unHelpfulCount: 1,
      isActive: false,
      isDeleted: false,
      createdAt: '2024-03-08T15:20:00Z',
      updatedAt: null,
      sellerId: 'seller-threadline',
      sellerName: 'ThreadLine Apparel',
      productName: 'Summer Dress',
      pipelineScore: 55,
      sentimentScore: 49,
      pipelineStatus: 'manual-review',
      autoPublishEligible: false,
      media: [
        { id: 'media-8', type: 'image', url: 'https://via.placeholder.com/400x300?text=Summer+Dress' }
      ],
    },
  ];

  search(filter: SiteReviewFilter = {}): Observable<SiteReviewSearchResult> {
    const payload: SiteReviewFilter = { currentPage: 1, numberPerPage: 500, ...filter };
    let reviews = [...this.mockReviews];

    if (payload.isActive !== null && payload.isActive !== undefined) {
      reviews = reviews.filter((review) => review.isActive === payload.isActive);
    }

    return of({
      data: reviews,
      pager: {
        totalItems: reviews.length,
        currentPage: 1,
        numberPerPage: 500,
        totalPages: 1,
      }
    }).pipe(delay(180));
  }

  fetchAll(filter: Omit<SiteReviewFilter, 'isActive'> = {}): Observable<SiteReviewSearchResult> {
    return this.search({ ...filter, isActive: null });
  }

  fetchPublished(filter: Omit<SiteReviewFilter, 'isActive'> = {}): Observable<SiteReviewSearchResult> {
    return this.search({ ...filter, isActive: true });
  }

  fetchUnpublished(filter: Omit<SiteReviewFilter, 'isActive'> = {}): Observable<SiteReviewSearchResult> {
    return this.search({ ...filter, isActive: false });
  }

  getReviews(): Observable<Review[]> {
    return of([...this.mockReviews]).pipe(delay(180));
  }

  getById(id: string): Observable<Review> {
    return of(this.mockReviews.find((review) => review.id === id)!).pipe(delay(150));
  }

  getStatistics(): Observable<SiteCategoryReview[]> {
    const stats: SiteCategoryReview[] = [
      {
        id: 1,
        category: 'Product Quality',
        reviewerCount: 12,
        rating: 4.2,
        reviewCount: 12,
      },
      {
        id: 2,
        category: 'Delivery',
        reviewerCount: 8,
        rating: 4.5,
        reviewCount: 8,
      },
      {
        id: 3,
        category: 'Service',
        reviewerCount: 6,
        rating: 4.1,
        reviewCount: 6,
      },
    ];

    return of(stats).pipe(delay(150));
  }

  create(dto: CreateSiteReviewDto): Observable<Review> {
    const newReview: Review = {
      id: Math.random().toString(36).slice(2, 11),
      userId: `user-${Math.random().toString(36).slice(2, 7)}`,
      title: dto.title,
      description: dto.description,
      starRating: dto.starRating,
      media: dto.media?.map((m, i) => ({ id: `media-${i}`, ...m })),
      helpfulCount: 0,
      unHelpfulCount: 0,
      isActive: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      sellerId: 'seller-aurora',
      sellerName: 'Aurora Beauty',
      productName: 'Recently Added Product',
      pipelineScore: dto.starRating >= 4 ? 84 : dto.starRating === 3 ? 58 : 33,
      sentimentScore: dto.starRating >= 4 ? 80 : dto.starRating === 3 ? 50 : 28,
      pipelineStatus: dto.starRating >= 4 ? 'approved' : dto.starRating === 3 ? 'manual-review' : 'blocked',
      autoPublishEligible: dto.starRating >= 4,
    };

    this.mockReviews = [newReview, ...this.mockReviews];
    return of(newReview).pipe(delay(180));
  }

  createReview(dto: CreateSiteReviewDto): Observable<Review> {
    return this.create(dto);
  }

  publish(id: string): Observable<{ id: string; isActive: boolean }> {
    const review = this.mockReviews.find((item) => item.id === id);
    if (review) {
      review.isActive = true;
      review.pipelineStatus = 'approved';
    }
    return of({ id, isActive: true }).pipe(delay(120));
  }

  unpublish(id: string): Observable<{ id: string; isActive: boolean }> {
    const review = this.mockReviews.find((item) => item.id === id);
    if (review) {
      review.isActive = false;
      review.pipelineStatus = 'manual-review';
    }
    return of({ id, isActive: false }).pipe(delay(120));
  }

  setPublishStatus(id: string, isActive: boolean): Observable<{ id: string; isActive: boolean }> {
    return isActive ? this.publish(id) : this.unpublish(id);
  }

  togglePublish(reviewId: string, published: boolean): Observable<{ id: string; isActive: boolean }> {
    return this.setPublishStatus(reviewId, published);
  }

  bulkPublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return of(ids.map((id) => {
      const review = this.mockReviews.find((item) => item.id === id);
      if (review) {
        review.isActive = true;
        review.pipelineStatus = 'approved';
      }
      return { id, isActive: true };
    })).pipe(delay(200));
  }

  bulkUnpublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return of(ids.map((id) => {
      const review = this.mockReviews.find((item) => item.id === id);
      if (review) {
        review.isActive = false;
        review.pipelineStatus = 'manual-review';
      }
      return { id, isActive: false };
    })).pipe(delay(200));
  }

  delete(id: string): Observable<unknown> {
    this.mockReviews = this.mockReviews.filter((review) => review.id !== id);
    return of({}).pipe(delay(120));
  }

  deleteReview(id: string): Observable<unknown> {
    return this.delete(id);
  }

  bulkDelete(ids: string[]): Observable<unknown[]> {
    this.mockReviews = this.mockReviews.filter((review) => !ids.includes(review.id));
    return of(ids.map(() => ({}))).pipe(delay(200));
  }

  markHelpful(reviewId: string): Observable<unknown> {
    const review = this.mockReviews.find((item) => item.id === reviewId);
    if (review) review.helpfulCount++;
    return of({}).pipe(delay(80));
  }

  markUnhelpful(reviewId: string): Observable<unknown> {
    const review = this.mockReviews.find((item) => item.id === reviewId);
    if (review) review.unHelpfulCount++;
    return of({}).pipe(delay(80));
  }

  calculateRatingBreakdown(reviews: Review[]): RatingBreakdown[] {
    const count = reviews.length;
    return RATING_CONFIG.map((config) => {
      const matches = reviews.filter((review) => review.rating === config.starNumber).length;
      return {
        ...config,
        raterCount: matches,
        progress: count > 0 ? (matches * 100) / count : 0,
      };
    });
  }

  calculateCategoryStats(statistics: SiteCategoryReview[]): {
    categories: SiteCategoryReview[];
    totalCount: number;
    weightedAvg: number;
  } {
    const totalCount = statistics.reduce((sum, item) => sum + (item.reviewCount ?? item.reviewerCount ?? 0), 0);
    const weightedAvg =
      totalCount > 0
        ? statistics.reduce(
            (sum, item) => sum + (item.avgReview ?? item.rating ?? 0) * (item.reviewCount ?? item.reviewerCount ?? 0),
            0,
          ) / totalCount
        : 0;

    const categories: SiteCategoryReview[] = [
      { id: 0, category: 'All', reviewerCount: totalCount, rating: weightedAvg, key: null },
      ...statistics.map((item) => ({
        ...item,
        key: (item.reviewCategory ?? item.category ?? '').toLowerCase(),
      })),
    ];

    return { categories, totalCount, weightedAvg };
  }
}
