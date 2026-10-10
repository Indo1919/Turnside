export type CategoryType =
  "cafe" | "culture" | "dining" | "niche" | "nightlife" | "nature" | "transit";

export interface StopWeather {
  tempC: number;
  tempF: number;
  apparentTempC?: number;
  condition: string;
  icon: string;
  precipProb: number;
  activityTip: string;
  clothingTip?: string;
  humidity?: number;
  windSpeedKmH?: number;
  isOutdoor?: boolean;
}

export interface CityWeatherForecast {
  source?: "open-meteo" | "demo" | string;
  observedAt?: string;
  current: {
    tempC: number;
    tempF: number;
    apparentTempC: number;
    condition: string;
    icon: string;
    precipitationMm: number;
    humidity: number;
    windSpeedKmH: number;
    advice: string;
  };
  hourly: Array<{
    time: string;
    tempC: number;
    tempF: number;
    condition: string;
    icon: string;
    precipProb: number;
    tip: string;
  }>;
  daily: {
    maxC: number;
    minC: number;
  };
}

export interface ItineraryStop {
  source?: "editorial-demo" | "google-maps-grounding" | "google-places";
  sourceLabel?: string;
  googlePlaceId?: string;
  attributions?: { provider: string; providerUri?: string }[];
  sourceUrl?: string;
  bookingUrl?: string;
  id: string;
  title: string;
  time: string;
  durationMinutes: number;
  category: CategoryType;
  categoryLabel: string;
  coordinates: [number, number]; // [longitude, latitude]
  address: string;
  description: string;
  insiderSecret: string;
  localSecretScore: number; // 0-100 (high = well-kept secret)
  touristTrapRisk: number; // 0-100 (low = authentic)
  ticketRequired: boolean;
  ticketCost?: string;
  bookingSlot?: string;
  estimatedCost?: string;
  status: "upcoming" | "current" | "completed" | "skipped";
  bookingPass?: BookingPass;
  weather?: StopWeather;
}

export interface DayPlan {
  dayNumber: number;
  title: string;
  date: string;
  stops: ItineraryStop[];
}

export interface TrendyHotspot {
  sourceLabel?: string;
  address?: string;
  sourceUrl?: string;
  bookingUrl?: string;
  durationMinutes?: number;
  ticketRequired?: boolean;
  ticketCost?: string;
  estimatedCost?: string;
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  category: string;
  secrecyScore: number; // e.g. 96
  touristTrapScore: number; // e.g. 4
  discoveredBy: string; // e.g. "Recommended by brother-in-law who lived in Daikanyama"
  story: string;
  badge: string;
  insiderTip?: string;
}

export interface TripPlan {
  source?: string;
  timeZone?: string;
  timezone?: string;
  notice?: string;
  city: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  summary: string;
  vibe: string;
  days: DayPlan[];
  trendyHotspots: TrendyHotspot[];
}

export interface BookingPass {
  status?: "handoff" | "demo" | "confirmed";
  providerName?: string;
  bookingUrl?: string;
  reservationCode: string;
  guestName: string;
  partySize: number;
  venue: string;
  timeSlot: string;
  dressCode?: string;
  secretEntrance?: string;
  specialPerk?: string;
  notes?: string;
  barcodeData?: string;
  bookedAt?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "concierge";
  text: string;
  timestamp: string;
  audioBase64?: string;
  suggestedAction?: {
    type: "focus_stop" | "add_hotspot" | "book_pass";
    payload: any;
  };
}

export type MapStyleKey =
  "dark" | "streets" | "navigation" | "satellite" | "carto";

export interface MapStyleOption {
  id: MapStyleKey;
  name: string;
  url: string;
  description: string;
}

export type HeatSourceType =
  "maps" | "search" | "weather" | "transit" | "editorial" | "bookings";

export interface HeatmapSource {
  name: string;
  category: HeatSourceType;
  reliabilityScore: number; // e.g. 98 (%)
  sampleLatency: string; // e.g. "< 3s (Live stream)"
  metricLabel: string; // e.g. "Footfall Density"
  metricValue: string; // e.g. "+34% above baseline"
  verified: boolean;
  provider: string; // e.g. "Google Maps Platform Places API"
}

export interface HeatmapNode {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  heatScore: number; // 0 to 100
  baseHeat: number;
  searchVelocityScore: number; // 0-100
  footTrafficIndex: number; // 0-100
  reservationVelocity: number; // 0-100
  microclimateScore: number; // 0-100
  trendDirection: "surging" | "rising" | "stable" | "cooling";
  trendPercent: number; // e.g. +38%
  primaryDriver: string;
  sources: HeatmapSource[];
  category: string;
  radiusMeters?: number;
  lastRefreshed: string;
}

export interface HeatTelemetryEvent {
  id: string;
  timestamp: string;
  nodeName: string;
  event: string;
  source: string;
  heatDelta: number;
  level: "surge" | "update" | "sensor";
}

export type HeatFilterMode =
  "composite" | "search" | "footfall" | "reservations" | "microclimate";
