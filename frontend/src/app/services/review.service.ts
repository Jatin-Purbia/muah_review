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
      heading: 'Delivery felt premium and fast',
      comment: 'My order arrived in two days, the packaging was secure, and the tracking updates were clear the whole way through. It felt like a polished premium brand experience.',
      reviewCategory: 'Delivery',
      rating: 5,
      nickName: 'Ava R.',
      customerName: 'Ava Reed',
      helpfulCount: 24,
      unHelpfulCount: 1,
      creator: {
        userId: 'user-001',
        firstName: 'Ava',
        lastName: 'Reed',
        fullName: 'Ava Reed',
        nickName: 'Ava R.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Delivery speed', sentiment: 'positive', score: 93 },
        { segment: 'Packaging', sentiment: 'positive', score: 90 },
        { segment: 'Tracking clarity', sentiment: 'positive', score: 82 },
      ],
    },
    {
      id: '2',
      userId: 'user-002',
      heading: 'Support team guided me before buying',
      comment: 'I asked a few ingredient questions and the support team replied quickly with a simple routine recommendation. It made me much more confident about placing the order.',
      reviewCategory: 'Service',
      rating: 5,
      nickName: 'Nina P.',
      customerName: 'Nina Patel',
      helpfulCount: 18,
      unHelpfulCount: 0,
      creator: {
        userId: 'user-002',
        firstName: 'Nina',
        lastName: 'Patel',
        fullName: 'Nina Patel',
        nickName: 'Nina P.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Response speed', sentiment: 'positive', score: 90 },
        { segment: 'Recommendation quality', sentiment: 'positive', score: 87 },
      ],
    },
    {
      id: '3',
      userId: 'user-003',
      heading: 'Comfortable fabric and clean stitching',
      comment: 'The polo feels soft, breathable, and comfortable for all-day wear. It looks sharp enough for casual office days and still feels easy on weekends.',
      reviewCategory: 'Product',
      rating: 5,
      nickName: 'Leo M.',
      customerName: 'Leo Martin',
      helpfulCount: 12,
      unHelpfulCount: 2,
      creator: {
        userId: 'user-003',
        firstName: 'Leo',
        lastName: 'Martin',
        fullName: 'Leo Martin',
        nickName: 'Leo M.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Fabric quality', sentiment: 'positive', score: 88 },
        { segment: 'Fit', sentiment: 'positive', score: 82 },
        { segment: 'Value', sentiment: 'positive', score: 77 },
      ],
    },
    {
      id: '4',
      userId: 'user-004',
      heading: 'Works well but scent is a bit strong',
      comment: 'The cleanser leaves my skin balanced and clean, but the fragrance is stronger than I expected. I would still use it, though I am unsure whether that scent will appeal to everyone.',
      reviewCategory: 'Product',
      rating: 3,
      nickName: 'Mia C.',
      customerName: 'Mia Chen',
      helpfulCount: 8,
      unHelpfulCount: 4,
      creator: {
        userId: 'user-004',
        firstName: 'Mia',
        lastName: 'Chen',
        fullName: 'Mia Chen',
        nickName: 'Mia C.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Formula performance', sentiment: 'positive', score: 72 },
        { segment: 'Fragrance', sentiment: 'negative', score: 29 },
      ],
    },
    {
      id: '5',
      userId: 'user-005',
      heading: 'Shade range missed my undertone',
      comment: 'The finish is beautiful, but I struggled to find a match that works for my undertone. The product quality seems good, though the current options feel limited for me.',
      reviewCategory: 'Quality',
      rating: 2,
      nickName: 'Jules H.',
      customerName: 'Jules Harper',
      helpfulCount: 5,
      unHelpfulCount: 8,
      creator: {
        userId: 'user-005',
        firstName: 'Jules',
        lastName: 'Harper',
        fullName: 'Jules Harper',
        nickName: 'Jules H.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Shade range', sentiment: 'negative', score: 14 },
        { segment: 'Finish', sentiment: 'positive', score: 74 },
      ],
    },
    {
      id: '6',
      userId: 'user-006',
      heading: 'Returns process was easier than expected',
      comment: 'I had to exchange a size and the process was straightforward. The portal was easy to use and the replacement arrived quickly after the return was picked up.',
      reviewCategory: 'Returns',
      rating: 4,
      nickName: 'Priya S.',
      customerName: 'Priya Shah',
      helpfulCount: 11,
      unHelpfulCount: 1,
      creator: {
        userId: 'user-006',
        firstName: 'Priya',
        lastName: 'Shah',
        fullName: 'Priya Shah',
        nickName: 'Priya S.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Return workflow', sentiment: 'positive', score: 79 },
        { segment: 'Replacement speed', sentiment: 'positive', score: 74 },
      ],
    },
    {
      id: '7',
      userId: 'user-007',
      heading: 'Website felt slow on mobile checkout',
      comment: 'The product itself is good, but the mobile checkout froze twice before the payment finally went through. I almost gave up because the experience felt unstable.',
      reviewCategory: 'Website',
      rating: 2,
      nickName: 'Omar T.',
      customerName: 'Omar Torres',
      helpfulCount: 15,
      unHelpfulCount: 2,
      creator: {
        userId: 'user-007',
        firstName: 'Omar',
        lastName: 'Torres',
        fullName: 'Omar Torres',
        nickName: 'Omar T.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Checkout stability', sentiment: 'negative', score: 18 },
        { segment: 'Product satisfaction', sentiment: 'positive', score: 68 },
      ],
    },
    {
      id: '8',
      userId: 'user-008',
      heading: 'Happy with the item, disappointed by packaging damage',
      comment: 'The dress looks great and fits well, but the outer box was crushed when it arrived. Thankfully the product was fine, though the unboxing experience was disappointing.',
      reviewCategory: 'Complaints',
      rating: 3,
      nickName: 'Sofia G.',
      customerName: 'Sofia Garcia',
      helpfulCount: 9,
      unHelpfulCount: 1,
      creator: {
        userId: 'user-008',
        firstName: 'Sofia',
        lastName: 'Garcia',
        fullName: 'Sofia Garcia',
        nickName: 'Sofia G.',
        profileImage: '',
      },
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
      segments: [
        { segment: 'Product fit', sentiment: 'positive', score: 76 },
        { segment: 'Packaging condition', sentiment: 'negative', score: 24 },
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
    const reviewsByCategory = new Map<string, Review[]>();

    for (const review of this.mockReviews) {
      const list = reviewsByCategory.get(review.reviewCategory) ?? [];
      list.push(review);
      reviewsByCategory.set(review.reviewCategory, list);
    }

    const stats: SiteCategoryReview[] = [...reviewsByCategory.entries()].map(([category, reviews], index) => ({
      id: index + 1,
      category,
      reviewerCount: reviews.length,
      rating: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
      reviewCount: reviews.length,
    }));

    return of(stats).pipe(delay(150));
  }

  create(dto: CreateSiteReviewDto): Observable<Review> {
    const newReview: Review = {
      id: Math.random().toString(36).slice(2, 11),
      userId: `user-${Math.random().toString(36).slice(2, 7)}`,
      heading: 'New review awaiting moderation',
      comment: dto.comment,
      reviewCategory: dto.reviewCategory,
      rating: dto.rating,
      nickName: dto.customerName,
      customerName: dto.customerName,
      helpfulCount: 0,
      unHelpfulCount: 0,
      creator: null,
      isActive: dto.isActive,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      sellerId: 'seller-aurora',
      sellerName: 'Aurora Beauty',
      productName: 'Recently Added Product',
      pipelineScore: dto.rating >= 4 ? 84 : dto.rating === 3 ? 58 : 33,
      sentimentScore: dto.rating >= 4 ? 80 : dto.rating === 3 ? 50 : 28,
      pipelineStatus: dto.rating >= 4 ? 'approved' : dto.rating === 3 ? 'manual-review' : 'blocked',
      autoPublishEligible: dto.rating >= 4,
      segments: [
        { segment: 'Overall sentiment', sentiment: dto.rating >= 4 ? 'positive' : dto.rating === 3 ? 'neutral' : 'negative', score: dto.rating * 20 },
      ],
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
