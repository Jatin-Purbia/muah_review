import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  Review,
  CreateSiteReviewDto,
  ProductCatalogItem,
  SiteReviewFilter,
  SiteReviewSearchResult,
  SiteCategoryReview,
  RatingBreakdown,
  RATING_CONFIG,
} from '../models/review.model';
import { environment } from '../../environments/environment';

const BACKEND_URL = environment.apiUrl;

interface BackendReview {
  id: string;
  user_id: string;
  seller_id: string;
  product_id: string;
  title: string;
  description: string;
  star_rating: number;
  category?: string;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  media_ids: string[];
}

interface BackendReviewDetail extends BackendReview {
  product_name?: string;
  seller_name?: string;
  text_analysis?: {
    overall_score?: number;
  } | null;
  fusion_decision?: {
    final_score?: number;
    decision?: string;
  } | null;
}

interface BackendProduct {
  id: string;
  name: string;
  description: string;
  seller_id: string;
  seller_name: string;
  brand_id?: string | null;
  price: number;
  image_url?: string | null;
  review_count: number;
  review_avg: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  constructor(private http: HttpClient) {}

  private mapPipelineStatus(status: string | undefined): Review['pipelineStatus'] {
    if (!status) return 'pending';
    if (status === 'published' || status === 'approved') return 'approved';
    if (status === 'pending_manual_review' || status === 'unpublished') return 'manual-review';
    if (status === 'rejected' || status === 'flagged' || status === 'failed') return 'blocked';
    return 'pending';
  }

  private mapBackendReview(detail: BackendReviewDetail): Review {
    return {
      id: detail.id,
      userId: detail.user_id,
      title: detail.title,
      description: detail.description,
      starRating: detail.star_rating,
      category: detail.category ?? 'Products',
      helpfulCount: 0,
      unHelpfulCount: 0,
      isActive: detail.is_published,
      isDeleted: false,
      createdAt: detail.created_at,
      updatedAt: detail.updated_at ?? null,
      sellerId: detail.seller_id,
      sellerName: detail.seller_name ?? detail.seller_id,
      productName: detail.product_name ?? detail.product_id,
      pipelineScore: detail.fusion_decision?.final_score !== undefined ? Math.round(detail.fusion_decision.final_score * 100) : undefined,
      sentimentScore: detail.text_analysis?.overall_score !== undefined ? Math.round(detail.text_analysis.overall_score * 100) : undefined,
      pipelineStatus: this.mapPipelineStatus(detail.fusion_decision?.decision ?? detail.status),
      autoPublishEligible: (detail.fusion_decision?.decision ?? detail.status) === 'published',
    };
  }

  getProducts(): Observable<ProductCatalogItem[]> {
    return this.http.get<BackendProduct[]>(`${BACKEND_URL}/products`).pipe(
      map((products) => products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        sellerId: product.seller_id,
        sellerName: product.seller_name,
        brandId: product.brand_id ?? null,
        price: product.price,
        imageUrl: product.image_url ?? null,
        reviewCount: product.review_count,
        reviewAvg: product.review_avg,
      })))
    );
  }

  private getReviewDetail(id: string): Observable<Review> {
    return this.http.get<BackendReviewDetail>(`${BACKEND_URL}/reviews/${id}`).pipe(
      map((detail) => this.mapBackendReview(detail))
    );
  }

  search(filter: SiteReviewFilter = {}): Observable<SiteReviewSearchResult> {
    return this.getReviews().pipe(
      map((reviews) => {
        const payload: SiteReviewFilter = { currentPage: 1, numberPerPage: 500, ...filter };
        let filtered = [...reviews];

        if (payload.isActive !== null && payload.isActive !== undefined) {
          filtered = filtered.filter((review) => review.isActive === payload.isActive);
        }

        return {
          data: filtered,
          pager: {
            totalItems: filtered.length,
            currentPage: 1,
            numberPerPage: 500,
            totalPages: 1,
          }
        };
      })
    );
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
    return this.http.get<BackendReviewDetail[]>(`${BACKEND_URL}/admin/reviews`).pipe(
      map((reviews) => reviews.map((review) => this.mapBackendReview(review))),
      map((reviews) => [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    );
  }

  getById(id: string): Observable<Review> {
    return this.getReviewDetail(id);
  }

  getStatistics(): Observable<SiteCategoryReview[]> {
    const stats: SiteCategoryReview[] = [
      { id: 1, category: 'Product Quality', reviewerCount: 12, rating: 4.2, reviewCount: 12 },
      { id: 2, category: 'Delivery', reviewerCount: 8, rating: 4.5, reviewCount: 8 },
      { id: 3, category: 'Service', reviewerCount: 6, rating: 4.1, reviewCount: 6 },
    ];

    return of(stats).pipe(delay(150));
  }

  create(dto: CreateSiteReviewDto): Observable<Review> {
    return this.http.post<{ review: BackendReview }>(`${BACKEND_URL}/reviews`, {
      user_id: `user-${Math.random().toString(36).slice(2, 7)}`,
      seller_id: dto.sellerId,
      product_id: dto.productId,
      title: dto.title,
      description: dto.description,
      star_rating: dto.starRating,
      category: dto.category,
      media: (dto.media ?? []).map((item) => ({
        media_type: item.type,
        media_url: item.url,
      })),
    }).pipe(
      map((response) => this.mapBackendReview(response.review as BackendReviewDetail))
    );
  }

  createReview(dto: CreateSiteReviewDto): Observable<Review> {
    return this.create(dto);
  }

  publish(id: string): Observable<{ id: string; isActive: boolean }> {
    return this.http.post<BackendReview>(`${BACKEND_URL}/admin/reviews/${id}/publish`, {
      actor: 'frontend-admin',
      reason: 'Published from dashboard',
    }).pipe(
      map((review) => ({ id: review.id, isActive: review.is_published }))
    );
  }

  unpublish(id: string): Observable<{ id: string; isActive: boolean }> {
    return this.http.post<BackendReview>(`${BACKEND_URL}/admin/reviews/${id}/unpublish`, {
      actor: 'frontend-admin',
      reason: 'Moved back to moderation from dashboard',
    }).pipe(
      map((review) => ({ id: review.id, isActive: review.is_published }))
    );
  }

  reject(id: string): Observable<Review> {
    return this.http.post<BackendReviewDetail>(`${BACKEND_URL}/admin/reviews/${id}/reject`, {
      actor: 'frontend-admin',
      reason: 'Blocked from dashboard by super admin',
    }).pipe(
      map((review) => this.mapBackendReview(review))
    );
  }

  setPublishStatus(id: string, isActive: boolean): Observable<{ id: string; isActive: boolean }> {
    return isActive ? this.publish(id) : this.unpublish(id);
  }

  togglePublish(reviewId: string, published: boolean): Observable<{ id: string; isActive: boolean }> {
    return this.setPublishStatus(reviewId, published);
  }

  bulkPublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return ids.length ? forkJoin(ids.map((id) => this.publish(id))) : of([]);
  }

  bulkUnpublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return ids.length ? forkJoin(ids.map((id) => this.unpublish(id))) : of([]);
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`${BACKEND_URL}/admin/reviews/${id}`, {
      body: {
        actor: 'frontend-admin',
        reason: 'Deleted from dashboard',
      },
    });
  }

  deleteReview(id: string): Observable<unknown> {
    return this.delete(id);
  }

  blockReview(id: string): Observable<Review> {
    return this.reject(id);
  }

  bulkDelete(ids: string[]): Observable<unknown[]> {
    return ids.length ? forkJoin(ids.map((id) => this.delete(id))) : of([]);
  }

  markHelpful(reviewId: string): Observable<unknown> {
    return of({}).pipe(delay(80));
  }

  markUnhelpful(reviewId: string): Observable<unknown> {
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
