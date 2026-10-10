export type HeatmapCategory = "all" | "food" | "culture" | "outdoors";
export type HeatmapSourceKind = "public" | "sample" | "unavailable";

export interface HeatmapDataSource {
  id: string;
  name: string;
  provider: string;
  logoKey: "nyc-open-data" | "nyc-planning" | "nyc-parks" | "turnside";
  kind: HeatmapSourceKind;
  category: Exclude<HeatmapCategory, "all">;
  datasetId?: string;
  sourceUrl: string;
  queryUrl?: string;
  fetchedAt: string;
  datasetUpdatedAt?: string;
  metricLabel: string;
  explanation: string;
  recordCount: number;
}

export interface HeatmapArea {
  id: string;
  name: string;
  coordinates: [number, number];
  center: [number, number];
  // Editorial comparison windows, not official neighborhood boundaries.
  bounds: [west: number, south: number, east: number, north: number];
  radiusMeters: number;
  areaKm2: number;
  counts: Record<HeatmapCategory, number>;
  densities: Record<HeatmapCategory, number>;
  // Within-category relative density: highest included window = 100.
  scores: Record<HeatmapCategory, number>;
  sourceKind: HeatmapSourceKind | "mixed";
  sourceIds: string[];
  sourceCounts: Record<string, number>;
  summary: string;
}

export interface AreaHeatmapResponse {
  success: true;
  city: string;
  source: "public-data" | "mixed" | "editorial-demo" | "unavailable";
  fetchedAt: string;
  cached: boolean;
  metric: "place-density";
  metricLabel: string;
  explanation: string;
  notice: string;
  areas: HeatmapArea[];
  sources: HeatmapDataSource[];
  totals: Record<HeatmapCategory, number>;
  supportedCategories: HeatmapCategory[];
}
