import { INITIAL_TRIP } from "../src/demoData";
import type {
  AreaHeatmapResponse,
  HeatmapArea,
  HeatmapCategory,
  HeatmapDataSource,
} from "../src/heatmapTypes";

const CACHE_MS = 20 * 60 * 1000;
const ROW_LIMIT = 25_000;
const CATEGORIES: HeatmapCategory[] = ["all", "food", "culture", "outdoors"];
type Category = Exclude<HeatmapCategory, "all">;
type Window = { id: string; name: string; bounds: HeatmapArea["bounds"] };
type Point = { id: string; coordinates: [number, number]; category: Category };
type Snapshot = { points: Point[]; sources: HeatmapDataSource[] };
type Options = {
  fetcher?: typeof fetch;
  now?: () => number;
  refresh?: boolean;
};
type CacheEntry = { expiresAt: number; data: AreaHeatmapResponse };
const caches = new WeakMap<typeof fetch, Map<string, CacheEntry>>();

// Fixed, non-overlapping rectangular comparison windows. These are deliberately
// not advertised as official NYC neighborhood boundaries or demographic areas.
export const NYC_HEAT_WINDOWS: Window[] = [
  { id: "soho", name: "SoHo", bounds: [-74.007, 40.719, -73.994, 40.728] },
  {
    id: "village",
    name: "Greenwich Village",
    bounds: [-74.011, 40.728, -73.991, 40.739],
  },
  {
    id: "chelsea",
    name: "Chelsea",
    bounds: [-74.012, 40.739, -73.992, 40.754],
  },
  {
    id: "les",
    name: "Lower East Side",
    bounds: [-73.991, 40.713, -73.974, 40.73],
  },
  {
    id: "dumbo",
    name: "DUMBO & waterfront",
    bounds: [-74.003, 40.697, -73.982, 40.708],
  },
  {
    id: "midtown",
    name: "Midtown",
    bounds: [-73.998, 40.754, -73.966, 40.769],
  },
];

function whereWindows(textCoordinates = false): string {
  // The DCP publication stores coordinates as text; numeric casts prevent a
  // type-mismatch response (and avoid incorrect lexicographic comparisons).
  const lat = textCoordinates ? "latitude::number" : "latitude";
  const lng = textCoordinates ? "longitude::number" : "longitude";
  return NYC_HEAT_WINDOWS.map(
    ({ bounds: [w, s, e, n] }) =>
      `(${lat} >= ${s} AND ${lat} < ${n} AND ${lng} >= ${w} AND ${lng} < ${e})`,
  ).join(" OR ");
}

function queryUrl(
  datasetId: string,
  select: string,
  where: string,
  group?: string,
): string {
  const url = new URL(
    `https://data.cityofnewyork.us/resource/${datasetId}.json`,
  );
  url.searchParams.set("$select", select);
  url.searchParams.set("$where", where);
  url.searchParams.set("$limit", String(ROW_LIMIT));
  if (group) url.searchParams.set("$group", group);
  return url.toString();
}

export function publicHeatmapQueryUrls() {
  return {
    restaurants: queryUrl(
      "43nn-pn8j",
      "camis,latitude,longitude",
      `(${whereWindows()}) AND camis IS NOT NULL`,
      "camis,latitude,longitude",
    ),
    restaurantsMetadata:
      "https://data.cityofnewyork.us/api/views/43nn-pn8j.json",
    facilities: queryUrl(
      "67g2-p84d",
      "uid,latitude,longitude,facgroup",
      `(${whereWindows(true)}) AND (facgroup = 'CULTURAL INSTITUTIONS' OR facgroup = 'PARKS AND PLAZAS')`,
    ),
    facilitiesMetadata:
      "https://data.cityofnewyork.us/api/views/67g2-p84d.json",
  };
}

async function json(fetcher: typeof fetch, url: string): Promise<any> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Public dataset unavailable");
  return response.json();
}

function officialMetadata(value: any): { updatedAt?: string } {
  if (!value || value.provenance !== "official")
    throw new Error("Dataset is not an official city publication");
  const timestamp = Number(value.rowsUpdatedAt);
  return {
    updatedAt:
      Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp * 1000).toISOString()
        : undefined,
  };
}

function coordinates(row: any): [number, number] | undefined {
  const latitude = Number(row?.latitude),
    longitude = Number(row?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 40 ||
    latitude > 42 ||
    longitude < -75 ||
    longitude > -72
  )
    return undefined;
  return [longitude, latitude];
}

function validRows(value: unknown): any[] {
  if (!Array.isArray(value) || value.length >= ROW_LIMIT)
    throw new Error("Dataset response is invalid or may be truncated");
  return value;
}

function uniquePoints(points: Point[]): Point[] {
  const unique = new Map<string, Point>();
  for (const point of points)
    if (!unique.has(point.id)) unique.set(point.id, point);
  return [...unique.values()];
}

async function restaurantSnapshot(
  fetcher: typeof fetch,
  fetchedAt: string,
): Promise<Snapshot> {
  const urls = publicHeatmapQueryUrls();
  const [raw, rawMetadata] = await Promise.all([
    json(fetcher, urls.restaurants),
    json(fetcher, urls.restaurantsMetadata),
  ]);
  const metadata = officialMetadata(rawMetadata);
  const points = uniquePoints(
    validRows(raw).map((row) => {
      const point = coordinates(row);
      if (!point || typeof row.camis !== "string" || !row.camis.trim())
        throw new Error("Invalid restaurant location record");
      return { id: row.camis, coordinates: point, category: "food" as const };
    }),
  );
  return {
    points,
    sources: [
      {
        id: "nyc-dohmh-restaurants",
        name: "Restaurant inspection locations",
        provider: "NYC Department of Health and Mental Hygiene",
        logoKey: "nyc-open-data",
        kind: "public",
        category: "food",
        datasetId: "43nn-pn8j",
        sourceUrl:
          "https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j",
        queryUrl: urls.restaurants,
        fetchedAt,
        datasetUpdatedAt: metadata.updatedAt,
        recordCount: points.length,
        metricLabel: "Distinct restaurant IDs",
        explanation:
          "Counts distinct CAMIS restaurant IDs represented in official inspection records within the six comparison windows. Inspection rows are deduplicated. Listings do not establish current opening status, popularity, safety, or crowd levels.",
      },
    ],
  };
}

async function facilitiesSnapshot(
  fetcher: typeof fetch,
  fetchedAt: string,
): Promise<Snapshot> {
  const urls = publicHeatmapQueryUrls();
  const [raw, rawMetadata] = await Promise.all([
    json(fetcher, urls.facilities),
    json(fetcher, urls.facilitiesMetadata),
  ]);
  const metadata = officialMetadata(rawMetadata);
  const points = uniquePoints(
    validRows(raw).map((row) => {
      const point = coordinates(row);
      const category: Category | undefined =
        row.facgroup === "CULTURAL INSTITUTIONS"
          ? "culture"
          : row.facgroup === "PARKS AND PLAZAS"
            ? "outdoors"
            : undefined;
      if (!point || typeof row.uid !== "string" || !row.uid || !category)
        throw new Error("Invalid facility location record");
      return { id: row.uid, coordinates: point, category };
    }),
  );
  const shared = {
    provider: "NYC Department of City Planning",
    logoKey: "nyc-planning" as const,
    kind: "public" as const,
    datasetId: "67g2-p84d",
    sourceUrl:
      "https://data.cityofnewyork.us/City-Government/facilities/67g2-p84d",
    queryUrl: urls.facilities,
    fetchedAt,
    datasetUpdatedAt: metadata.updatedAt,
  };
  return {
    points,
    sources: [
      {
        ...shared,
        id: "nyc-facdb-culture",
        name: "Cultural institution locations",
        category: "culture",
        recordCount: points.filter((p) => p.category === "culture").length,
        metricLabel: "Listed cultural facilities",
        explanation:
          "Distinct facility UIDs classified as CULTURAL INSTITUTIONS in NYC City Planning’s published Facilities Database. This is a limited institutional inventory, not every gallery, shop, event, or live opening status.",
      },
      {
        ...shared,
        id: "nyc-facdb-outdoors",
        name: "Park & plaza locations",
        category: "outdoors",
        recordCount: points.filter((p) => p.category === "outdoors").length,
        metricLabel: "Listed parks & plazas",
        explanation:
          "Distinct facility UIDs classified as PARKS AND PLAZAS. Counts facility points, not acres of greenery, visitor counts, permit events, or live park access.",
      },
    ],
  };
}

function editorialPoints(): Point[] {
  const places = [
    ...INITIAL_TRIP.days.flatMap((day) =>
      day.stops.map((stop) => ({
        id: stop.title,
        category: stop.category,
        coordinates: stop.coordinates,
      })),
    ),
    ...INITIAL_TRIP.trendyHotspots.map((spot) => ({
      id: spot.name,
      category: spot.category,
      coordinates: spot.coordinates,
    })),
  ];
  return uniquePoints(
    places.map((place) => ({
      id: place.id.toLowerCase().replace(/\s+/g, " ").trim(),
      coordinates: place.coordinates,
      category: (["cafe", "dining", "nightlife"].includes(place.category)
        ? "food"
        : place.category === "nature"
          ? "outdoors"
          : "culture") as Category,
    })),
  );
}

function inWindow(
  point: [number, number],
  bounds: HeatmapArea["bounds"],
): boolean {
  return (
    point[0] >= bounds[0] &&
    point[0] < bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] < bounds[3]
  );
}

function sampleSnapshot(category: Category, fetchedAt: string): Snapshot {
  const points = editorialPoints().filter(
    (point) =>
      point.category === category &&
      NYC_HEAT_WINDOWS.some((window) =>
        inWindow(point.coordinates, window.bounds),
      ),
  );
  return {
    points,
    sources: [
      {
        id: `turnside-editorial-${category}`,
        name: "Turnside editorial demo catalog",
        provider: "Turnside prototype",
        logoKey: "turnside",
        kind: "sample",
        category,
        sourceUrl: "/api/heatmap?city=New%20York",
        fetchedAt,
        recordCount: points.length,
        metricLabel: "Editorial demo picks",
        explanation:
          "Public data for this category could not be retrieved. These counts come only from the prototype’s New York itinerary and discovery catalog. They are sample selection counts, not external measurements or a complete local inventory.",
      },
    ],
  };
}

function areaKm2([west, south, east, north]: HeatmapArea["bounds"]): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  return (
    6371.0088 ** 2 *
    (Math.sin(radians(north)) - Math.sin(radians(south))) *
    radians(east - west)
  );
}

const emptyCounts = (): Record<HeatmapCategory, number> => ({
  all: 0,
  food: 0,
  culture: 0,
  outdoors: 0,
});

function assemble(
  snapshots: Snapshot[],
  fetchedAt: string,
): AreaHeatmapResponse {
  const sources = snapshots.flatMap((snapshot) => snapshot.sources);
  const kind = sources.every((source) => source.kind === "public")
    ? "public-data"
    : sources.every((source) => source.kind === "sample")
      ? "editorial-demo"
      : "mixed";
  const points = snapshots.flatMap((snapshot) => snapshot.points);
  const areas: HeatmapArea[] = NYC_HEAT_WINDOWS.map((window) => {
    const counts = emptyCounts();
    const sourceCounts: Record<string, number> = {};
    for (const source of sources)
      sourceCounts[source.id] = points.filter(
        (p) =>
          p.category === source.category &&
          inWindow(p.coordinates, window.bounds),
      ).length;
    for (const point of points)
      if (inWindow(point.coordinates, window.bounds)) {
        counts[point.category]++;
        counts.all++;
      }
    const size = areaKm2(window.bounds);
    const densities = Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        Number((counts[category] / size).toFixed(2)),
      ]),
    ) as Record<HeatmapCategory, number>;
    const center: [number, number] = [
      (window.bounds[0] + window.bounds[2]) / 2,
      (window.bounds[1] + window.bounds[3]) / 2,
    ];
    return {
      ...window,
      coordinates: center,
      center,
      areaKm2: Number(size.toFixed(3)),
      radiusMeters: Math.round(Math.sqrt(size / Math.PI) * 1000),
      counts,
      densities,
      scores: emptyCounts(),
      sourceKind:
        kind === "public-data"
          ? "public"
          : kind === "editorial-demo"
            ? "sample"
            : "mixed",
      sourceIds: sources.map((s) => s.id),
      sourceCounts,
      summary: `${counts.food} food listings · ${counts.culture} cultural locations · ${counts.outdoors} parks & plazas`,
    };
  });
  for (const category of CATEGORIES) {
    const maximum = Math.max(...areas.map((area) => area.densities[category]));
    for (const area of areas)
      area.scores[category] = maximum
        ? Math.round((area.densities[category] / maximum) * 100)
        : 0;
  }
  const totals = emptyCounts();
  for (const area of areas)
    for (const category of CATEGORIES)
      totals[category] += area.counts[category];
  return {
    success: true,
    city: "New York",
    source: kind,
    fetchedAt,
    cached: false,
    metric: "place-density",
    metricLabel:
      kind === "editorial-demo"
        ? "Editorial pick density"
        : "Listed place density",
    explanation:
      "Color compares listed records per square kilometre inside six fixed rectangular windows. Each category is scaled independently: the densest included window is 100. The windows are approximate comparison areas, include streets and water, and are not official neighborhood boundaries. All combines source inventories; it is not a unique count across providers. Source inventories have different scope and update schedules.",
    notice:
      kind === "public-data"
        ? "Fetched from official NYC public datasets. This shows listed place density, not what is trending, open now, crowded, or highly rated."
        : kind === "mixed"
          ? "Some public categories are unavailable and use clearly identified editorial sample counts. Check each source before comparing."
          : "Public sources are unavailable. This overlay uses only editorial demo picks, not measured city activity.",
    areas,
    sources,
    totals,
    supportedCategories: [...CATEGORIES],
  };
}

export async function fetchAreaHeatmap(
  city = "New York",
  options: Options = {},
): Promise<AreaHeatmapResponse> {
  const fetcher = options.fetcher || fetch,
    now = options.now || Date.now;
  if (
    !/^(?:new\s*york(?:\s*city)?|nyc|manhattan)(?:\s*,.*)?$/i.test(city.trim())
  )
    return {
      success: true,
      city,
      source: "unavailable",
      fetchedAt: new Date(now()).toISOString(),
      cached: false,
      metric: "place-density",
      metricLabel: "No public density coverage",
      explanation:
        "The current public density integration covers New York only.",
      notice:
        "Public area data is not connected for this city. No activity or trend values have been invented.",
      areas: [],
      sources: [],
      totals: emptyCounts(),
      supportedCategories: [],
    };
  let cache = caches.get(fetcher);
  if (!cache) {
    cache = new Map();
    caches.set(fetcher, cache);
  }
  const cached = cache.get("newyork");
  if (!options.refresh && cached && cached.expiresAt > now())
    return { ...cached.data, cached: true };
  const fetchedAt = new Date(now()).toISOString();
  const results = await Promise.allSettled([
    restaurantSnapshot(fetcher, fetchedAt),
    facilitiesSnapshot(fetcher, fetchedAt),
  ]);
  const food =
    results[0].status === "fulfilled"
      ? results[0].value
      : sampleSnapshot("food", fetchedAt);
  const facilities =
    results[1].status === "fulfilled"
      ? results[1].value
      : {
          points: [
            ...sampleSnapshot("culture", fetchedAt).points,
            ...sampleSnapshot("outdoors", fetchedAt).points,
          ],
          sources: [
            ...sampleSnapshot("culture", fetchedAt).sources,
            ...sampleSnapshot("outdoors", fetchedAt).sources,
          ],
        };
  const data = assemble([food, facilities], fetchedAt);
  cache.set("newyork", { expiresAt: now() + CACHE_MS, data });
  return data;
}
