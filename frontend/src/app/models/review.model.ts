// Site review models

export type PipelineStatus = 'approved' | 'manual-review' | 'blocked' | 'pending';

export interface ReviewCreator {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nickName: string;
  profileImage: string;
}

export interface ReviewSegmentInsight {
  segment: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
}

export interface ReviewMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
}

export interface Review {
  id: string;
  userId: string;
  title: string;
  description: string;
  starRating: number;
  category?: string;
  media?: ReviewMedia[];
  helpfulCount: number;
  unHelpfulCount: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string | null;
  sellerId?: string;
  sellerName?: string;
  productName?: string;
  pipelineScore?: number;
  sentimentScore?: number;
  pipelineStatus?: PipelineStatus;
  autoPublishEligible?: boolean;
  segments?: ReviewSegmentInsight[];
  // Legacy fields for backward compatibility
  heading?: string;
  comment?: string;
  reviewCategory?: string;
  rating?: number;
  nickName?: string;
  customerName?: string;
  creator?: ReviewCreator | null;
}

export interface ReviewCreate {
  title: string;
  description: string;
  starRating: number;
  media?: { type: 'image' | 'video'; url: string }[];
}

export interface ReviewUpdate {
  id: string;
  title: string;
  description: string;
  starRating: number;
  media?: { type: 'image' | 'video'; url: string }[];
}

// Search and filter

export interface SiteReviewFilter {
  currentPage?: number;
  numberPerPage?: number;
  isActive?: boolean | null;
  reviewCategory?: string;
  customer?: string;
  comment?: string;
  rating?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SiteReviewSearchResult {
  data: Review[];
  pager: {
    totalItems: number;
    currentPage: number;
    numberPerPage: number;
    totalPages: number;
  };
}

export interface CreateSiteReviewDto {
  productId: string;
  sellerId: string;
  title: string;
  description: string;
  starRating: number;
  category: string;
  media?: { type: 'image' | 'video'; url: string }[];
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  description: string;
  sellerId: string;
  sellerName: string;
  brandId?: string | null;
  price: number;
  imageUrl?: string | null;
  reviewCount: number;
  reviewAvg: number;
}

export interface SiteCategoryReview {
  id: number;
  category: string;
  reviewerCount: number;
  rating: number;
  key?: string | null;
  avgReview?: number;
  reviewCount?: number;
  reviewCategory?: string;
}

export const REVIEW_CATEGORIES = [
  'Products',
  'Delivery',
  'Service',
  'Returns',
  'Website',
  'Complaints',
] as const;

// Product review models

export interface ProductReview {
  productId: string;
  helpfulCount: number;
  unhelpfulCount: number;
  sizeFitRating: number;
  productRating: number;
  comments: string;
  heading: string;
  userId: string;
  status: number;
  customerId?: string;
  createdAt?: string;
  updatedAt?: string;
  visibleStatus: boolean;
  rating: number;
}

export interface ProductReviewCreate {
  heading: string;
  comments: string;
  rating: number;
  sizeFitRating?: number;
}

// Rating config

export interface RatingBreakdown {
  ratingsText: string;
  starNumber: number;
  progress: number;
  raterCount: number;
  progressColor: string;
}

export const RATING_CONFIG: RatingBreakdown[] = [
  { ratingsText: 'Excellent', starNumber: 5, progress: 0, raterCount: 0, progressColor: '#FFC800' },
  { ratingsText: 'Good', starNumber: 4, progress: 0, raterCount: 0, progressColor: '#FFC800' },
  { ratingsText: 'Average', starNumber: 3, progress: 0, raterCount: 0, progressColor: '#FFC800' },
  { ratingsText: 'Below Average', starNumber: 2, progress: 0, raterCount: 0, progressColor: '#FFC800' },
  { ratingsText: 'Poor', starNumber: 1, progress: 0, raterCount: 0, progressColor: '#FFC800' },
];

// Misc

export type PublishFilter = 'all' | 'published' | 'unpublished';
