export type RecommendationCategory =
  "cafe" | "culture" | "dining" | "niche" | "nightlife" | "nature" | "transit";
export interface RecommendationSource {
  name: string;
  url: string;
  provider: "Google Maps" | "Google Search" | "Venue / destination";
}
export interface Recommendation {
  id: string;
  title: string;
  city: string;
  category: RecommendationCategory;
  categoryLabel: string;
  description: string;
  reason: string;
  durationMinutes: number;
  coordinates?: [number, number];
  neighborhood?: string;
  address?: string;
  source: "editorial-demo" | "google-maps-grounding" | "google-places";
  sourceLabel: string;
  sourceUrl?: string;
  googlePlaceId?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  /** Identity supported by provider data; not a claim of current opening or availability. */
  verified: boolean;
  attributions: { provider: string; providerUri?: string }[];
  rating?: number;
  reviewCount?: number;
  openingHours?: {
    weekdayDescriptions?: string[];
    openNow?: boolean;
    nextOpenTime?: string;
    nextCloseTime?: string;
  };
  fetchedAt?: string;
  ticketRequired?: boolean;
  bookingUrl?: string;
  estimatedCost?: string;
  suggestedTime?: string;
}
export interface DiscoverParams {
  query: string;
  city?: string;
  areaId?: string;
  category?: string;
  userLocation?: [number, number];
  conversationHistory?: { sender: string; text: string }[];
  forceDemo?: boolean;
}
export interface RecommendationResponse {
  success: boolean;
  reply: string;
  recommendations: Recommendation[];
  source: "demo" | "gemini";
  notice?: string;
  fallback?: boolean;
  sources: RecommendationSource[];
  mapsWidgetContextToken?: string;
  /** Google-provided Search entry point. Render in a sandboxed frame, never as arbitrary page HTML. */
  searchSuggestionsHtml?: string;
}
