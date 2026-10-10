import type { HeatmapCategory } from "./heatmapTypes";

export type DiscoveryKind = "coffee" | "shop" | "food" | "culture" | "outdoors";
export interface DiscoveryEvidence {
  id: string;
  provider: "venue" | "google" | "tiktok" | "editorial" | "nyc-open-data";
  status: "verified-link" | "live" | "not-connected";
  label: string;
  detail: string;
  url: string;
  checkedAt: string;
  metric?: { value: number; unit: string };
}
export interface DiscoveryCard {
  id: string;
  areaId: string;
  name: string;
  kind: DiscoveryKind;
  category: Exclude<HeatmapCategory, "all">;
  address: string;
  coordinates: [number, number];
  description: string;
  reason: string;
  tags: string[];
  image: {
    url: string;
    alt: string;
    kind: "representative" | "venue";
    label: string;
    attribution: string;
  };
  links: { official: string; googleMaps: string; tiktokSearch: string };
  evidence: DiscoveryEvidence[];
  popularity: {
    status: "unavailable" | "google-review-signal";
    label: string;
    explanation: string;
    rating?: number;
    reviewCount?: number;
    fetchedAt?: string;
    sourceUrl?: string;
  };
}
export interface AreaDiscoveryResponse {
  success: true;
  areaId: string;
  areaName: string;
  city: "New York";
  category: HeatmapCategory;
  source: "editorial-catalog";
  checkedAt: string;
  notice: string;
  cards: DiscoveryCard[];
  areaSignal?: {
    count: number;
    density: number;
    metricLabel: string;
    sourceKind: string;
    fetchedAt: string;
  };
}
