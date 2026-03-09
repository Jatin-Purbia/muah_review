import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  Review, CreateSiteReviewDto,
  SiteReviewFilter, SiteReviewSearchResult,
  SiteCategoryReview, RatingBreakdown, RATING_CONFIG,
} from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly base = 'http://localhost:8000/api/site-reviews';

  constructor(private http: HttpClient) {}

  // SEARCH / FETCH

  search(filter: SiteReviewFilter = {}): Observable<SiteReviewSearchResult> {
    const payload: SiteReviewFilter = { currentPage: 1, numberPerPage: 500, ...filter };
    return this.http
      .put<SiteReviewSearchResult>(`${this.base}/search`, payload, { withCredentials: true })
      .pipe(catchError((e) => this.handleError(e)));
  }

  /** ALL reviews (published + drafts) - use in admin panel */
  fetchAll(filter: Omit<SiteReviewFilter, 'isActive'> = {}): Observable<SiteReviewSearchResult> {
    return this.search({ ...filter, isActive: null });
  }

  /** Published only - use on main/customer site */
  fetchPublished(filter: Omit<SiteReviewFilter, 'isActive'> = {}): Observable<SiteReviewSearchResult> {
    return this.search({ ...filter, isActive: true });
  }

  /** Drafts only - use in admin pending queue */
  fetchUnpublished(filter: Omit<SiteReviewFilter, 'isActive'> = {}): Observable<SiteReviewSearchResult> {
    return this.search({ ...filter, isActive: false });
  }

  /** Returns reviews as flat array with GET fallback when search returns 401 */
  getReviews(): Observable<Review[]> {
    return this.fetchAll().pipe(
      map((r) => r.data),
      catchError(() =>
        this.http
          .get<Review[] | { data: Review[] }>(this.base, { withCredentials: true })
          .pipe(map((r) => (Array.isArray(r) ? r : (r as any).data ?? []))),
      ),
    );
  }

  getById(id: string): Observable<Review> {
    return this.http
      .get<Review>(`${this.base}/${id}`, { withCredentials: true })
      .pipe(catchError((e) => this.handleError(e)));
  }

  getStatistics(): Observable<SiteCategoryReview[]> {
    return this.http
      .get<SiteCategoryReview[]>(`${this.base}/statistics`, { withCredentials: true })
      .pipe(catchError((e) => this.handleError(e)));
  }

  // CREATE

  create(dto: CreateSiteReviewDto): Observable<Review> {
    return this.http
      .post<Review>(this.base, dto, { withCredentials: true })
      .pipe(catchError((e) => this.handleError(e)));
  }

  createReview(dto: CreateSiteReviewDto): Observable<Review> {
    return this.create(dto);
  }

  // PUBLISH / UNPUBLISH

  publish(id: string): Observable<{ id: string; isActive: boolean }> {
    return this.http
      .put(`${this.base}/${id}/status/true`, {}, { withCredentials: true })
      .pipe(
        map(() => ({ id, isActive: true })),
        catchError((e) => this.handleError(e)),
      );
  }

  unpublish(id: string): Observable<{ id: string; isActive: boolean }> {
    return this.http
      .put(`${this.base}/${id}/status/false`, {}, { withCredentials: true })
      .pipe(
        map(() => ({ id, isActive: false })),
        catchError((e) => this.handleError(e)),
      );
  }

  setPublishStatus(id: string, isActive: boolean): Observable<{ id: string; isActive: boolean }> {
    return isActive ? this.publish(id) : this.unpublish(id);
  }

  togglePublish(reviewId: string, published: boolean): Observable<{ id: string; isActive: boolean }> {
    return this.setPublishStatus(reviewId, published);
  }

  bulkPublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return forkJoin(ids.map((id) => this.publish(id)));
  }

  bulkUnpublish(ids: string[]): Observable<{ id: string; isActive: boolean }[]> {
    return forkJoin(ids.map((id) => this.unpublish(id)));
  }

  // DELETE

  delete(id: string): Observable<unknown> {
    return this.http
      .delete(`${this.base}/${id}`, { withCredentials: true })
      .pipe(catchError((e) => this.handleError(e)));
  }

  deleteReview(id: string): Observable<unknown> {
    return this.delete(id);
  }

  bulkDelete(ids: string[]): Observable<unknown[]> {
    return forkJoin(ids.map((id) => this.delete(id)));
  }

  // HELPFUL VOTES

  markHelpful(reviewId: string): Observable<unknown> {
    return this.http.put(`${this.base}/${reviewId}/helpful`, {}, { withCredentials: true });
  }

  markUnhelpful(reviewId: string): Observable<unknown> {
    return this.http.put(`${this.base}/${reviewId}/unhelpful`, {}, { withCredentials: true });
  }

  // CLIENT-SIDE STATS

  calculateRatingBreakdown(reviews: Review[]): RatingBreakdown[] {
    const count = reviews.length;
    return RATING_CONFIG.map((cfg) => {
      const n = reviews.filter((r) => r.rating === cfg.starNumber).length;
      return { ...cfg, raterCount: n, progress: count > 0 ? (n * 100) / count : 0 };
    });
  }

  calculateCategoryStats(statistics: SiteCategoryReview[]): {
    categories: SiteCategoryReview[];
    totalCount: number;
    weightedAvg: number;
  } {
    const totalCount = statistics.reduce((s, x) => s + (x.reviewCount ?? x.reviewerCount ?? 0), 0);
    const weightedAvg =
      totalCount > 0
        ? statistics.reduce(
            (s, x) => s + (x.avgReview ?? x.rating ?? 0) * (x.reviewCount ?? x.reviewerCount ?? 0),
            0,
          ) / totalCount
        : 0;
    const categories: SiteCategoryReview[] = [
      { id: 0, category: 'All', reviewerCount: totalCount, rating: weightedAvg, key: null },
      ...statistics.map((x) => ({
        ...x,
        key: (x.reviewCategory ?? x.category ?? '').toLowerCase(),
      })),
    ];
    return { categories, totalCount, weightedAvg };
  }

  // ERROR HANDLER

  private handleError(error: any): Observable<never> {
    const message =
      error?.error?.message ?? 'An unexpected error occurred. Please try again.';
    console.error('[ReviewService]', message, error);
    return throwError(() => new Error(message));
  }
}
