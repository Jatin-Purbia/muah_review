import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const BACKEND_URL = environment.apiUrl;

export interface SellerAnalyticsSummary {
  seller_id: string;
  total_reviews: number;
  published_reviews: number;
  pending_reviews: number;
  flagged_reviews: number;
  rejected_reviews: number;
  avg_rating: number;
  sentiment_split: { positive: number; mixed: number; negative: number };
}

export interface SellerTrendPoint {
  date_label: string;
  avg_rating: number;
  reviews: number;
}

export interface SellerAspectInsight {
  aspect: string;
  positive_mentions: number;
  negative_mentions: number;
  neutral_mentions: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private http: HttpClient) {}

  getSummary(sellerId: string): Observable<SellerAnalyticsSummary> {
    return this.http.get<SellerAnalyticsSummary>(
      `${BACKEND_URL}/seller/${sellerId}/analytics/summary`
    );
  }

  getTrends(sellerId: string): Observable<SellerTrendPoint[]> {
    return this.http.get<SellerTrendPoint[]>(
      `${BACKEND_URL}/seller/${sellerId}/analytics/trends`
    );
  }

  getAspects(sellerId: string): Observable<SellerAspectInsight[]> {
    return this.http.get<SellerAspectInsight[]>(
      `${BACKEND_URL}/seller/${sellerId}/analytics/aspects`
    );
  }

  getSellerReviews(sellerId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${BACKEND_URL}/seller/${sellerId}/reviews`
    );
  }
}
