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
      heading: 'Fresh formulas and thoughtful packaging',
      comment: 'The serum texture feels luxurious, sinks in quickly, and the packaging looks premium on my vanity. It made the whole routine feel elevated.',
      reviewCategory: 'Product',
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
    },
    {
      id: '2',
      userId: 'user-002',
      heading: 'Helpful guidance before I ordered',
      comment: 'Support answered my ingredient questions within the hour and recommended the right bundle. It felt personal instead of scripted.',
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
    },
    {
      id: '3',
      userId: 'user-003',
      heading: 'Solid everyday staple',
      comment: 'I have been using this moisturizer for three weeks and it layers well under sunscreen. I would love a travel size, but the formula itself is reliable.',
      reviewCategory: 'Product',
      rating: 4,
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
    },
    {
      id: '4',
      userId: 'user-004',
      heading: 'Beautiful order experience from checkout to doorstep',
      comment: 'Everything arrived neatly packed, with samples included and clear care instructions. The full experience felt curated and calm.',
      reviewCategory: 'Delivery',
      rating: 5,
      nickName: 'Mia C.',
      customerName: 'Mia Chen',
      helpfulCount: 35,
      unHelpfulCount: 0,
      creator: {
        userId: 'user-004',
        firstName: 'Mia',
        lastName: 'Chen',
        fullName: 'Mia Chen',
        nickName: 'Mia C.',
        profileImage: '',
      },
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-12T16:45:00Z',
      updatedAt: null,
    },
    {
      id: '5',
      userId: 'user-005',
      heading: 'Nice results, still deciding on the scent',
      comment: 'The cleanser does what it promises and my skin feels balanced after use. The scent is stronger than I expected, so I saved this as a draft note for now.',
      reviewCategory: 'Product',
      rating: 3,
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
    },
    {
      id: '6',
      userId: 'user-006',
      heading: 'Shade range needs a little more work',
      comment: 'The finish is lovely, but I struggled to find a close match for my undertone. Keeping this unpublished until I retry a different shade.',
      reviewCategory: 'Quality',
      rating: 2,
      nickName: 'Priya S.',
      customerName: 'Priya Shah',
      helpfulCount: 3,
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
    },
    {
      id: '7',
      userId: 'user-007',
      heading: 'Pump stopped working too early',
      comment: 'I liked the formula, but the pump jammed after a week which made the bottle frustrating to use. Sharing this so the packaging team can improve it.',
      reviewCategory: 'Quality',
      rating: 1,
      nickName: 'Omar T.',
      customerName: 'Omar Torres',
      helpfulCount: 8,
      unHelpfulCount: 0,
      creator: {
        userId: 'user-007',
        firstName: 'Omar',
        lastName: 'Torres',
        fullName: 'Omar Torres',
        nickName: 'Omar T.',
        profileImage: '',
      },
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-09T10:00:00Z',
      updatedAt: null,
    },
    {
      id: '8',
      userId: 'user-008',
      heading: 'Warm follow-up after purchase',
      comment: 'I received a helpful message with routine tips after ordering, which made the brand feel attentive and human. Small touch, big impact.',
      reviewCategory: 'Support',
      rating: 5,
      nickName: 'Sofia G.',
      customerName: 'Sofia Garcia',
      helpfulCount: 22,
      unHelpfulCount: 0,
      creator: {
        userId: 'user-008',
        firstName: 'Sofia',
        lastName: 'Garcia',
        fullName: 'Sofia Garcia',
        nickName: 'Sofia G.',
        profileImage: '',
      },
      isActive: true,
      isDeleted: false,
      createdAt: '2024-03-08T15:20:00Z',
      updatedAt: null,
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
    }).pipe(delay(200));
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
    return of([...this.mockReviews]).pipe(delay(200));
  }

  getById(id: string): Observable<Review> {
    return of(this.mockReviews.find((review) => review.id === id)!).pipe(delay(150));
  }

  getStatistics(): Observable<SiteCategoryReview[]> {
    const stats: SiteCategoryReview[] = [
      { id: 1, category: 'Product', reviewerCount: 4, rating: 4.3, reviewCount: 4 },
      { id: 2, category: 'Service', reviewerCount: 1, rating: 5, reviewCount: 1 },
      { id: 3, category: 'Delivery', reviewerCount: 1, rating: 5, reviewCount: 1 },
      { id: 4, category: 'Quality', reviewerCount: 2, rating: 1.5, reviewCount: 2 },
      { id: 5, category: 'Support', reviewerCount: 1, rating: 5, reviewCount: 1 },
    ];

    return of(stats).pipe(delay(180));
  }

  create(dto: CreateSiteReviewDto): Observable<Review> {
    const newReview: Review = {
      id: Math.random().toString(36).slice(2, 11),
      userId: `user-${Math.random().toString(36).slice(2, 7)}`,
      heading: '',
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
    };

    this.mockReviews = [newReview, ...this.mockReviews];
    return of(newReview).pipe(delay(180));
  }

  createReview(dto: CreateSiteReviewDto): Observable<Review> {
    return this.create(dto);
  }

  publish(id: string): Observable<{ id: string; isActive: boolean }> {
    const review = this.mockReviews.find((item) => item.id === id);
    if (review) review.isActive = true;
    return of({ id, isActive: true }).pipe(delay(120));
  }

  unpublish(id: string): Observable<{ id: string; isActive: boolean }> {
    const review = this.mockReviews.find((item) => item.id === id);
    if (review) review.isActive = false;
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
      if (review) review.isActive = true;
      return { id, isActive: true };
    })).pipe(delay(200));
  }

  bulkUnpublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return of(ids.map((id) => {
      const review = this.mockReviews.find((item) => item.id === id);
      if (review) review.isActive = false;
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
