import assert from "node:assert/strict";
import test from "node:test";
import { fetchAreaHeatmap, publicHeatmapQueryUrls } from "../backend/heatmap";

const restaurants = [
  { camis: "food-1", latitude: "40.7230", longitude: "-74.0000" },
  { camis: "food-1", latitude: "40.7230", longitude: "-74.0000" },
  { camis: "food-2", latitude: "40.7320", longitude: "-74.0010" },
];
const facilities = [
  {
    uid: "culture-1",
    latitude: "40.7340",
    longitude: "-74.0010",
    facgroup: "CULTURAL INSTITUTIONS",
  },
  {
    uid: "park-1",
    latitude: "40.7310",
    longitude: "-73.9970",
    facgroup: "PARKS AND PLAZAS",
  },
  {
    uid: "park-1",
    latitude: "40.7310",
    longitude: "-73.9970",
    facgroup: "PARKS AND PLAZAS",
  },
];
const official = { provenance: "official", rowsUpdatedAt: 1_730_000_000 };
function mockFetcher(
  options: {
    facilitiesUnavailable?: boolean;
    communityMetadata?: boolean;
    malformedRestaurants?: boolean;
  } = {},
) {
  let requests = 0;
  const fetcher = (async (input: string | URL | Request) => {
    requests++;
    const url = String(input),
      isFacilities = url.includes("67g2-p84d");
    if (isFacilities && options.facilitiesUnavailable)
      return new Response("{}", { status: 503 });
    const metadata = options.communityMetadata
      ? { ...official, provenance: "community" }
      : official;
    const data = url.includes("/api/views/")
      ? metadata
      : isFacilities
        ? facilities
        : options.malformedRestaurants
          ? { error: "query error" }
          : restaurants;
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, requests: () => requests };
}

test("public density deduplicates inspection and facility rows, preserving real per-source counts", async () => {
  const mock = mockFetcher();
  const result = await fetchAreaHeatmap("New York", {
    fetcher: mock.fetcher,
    now: () => 1_790_000_000_000,
  });
  assert.equal(result.source, "public-data");
  assert.deepEqual(result.totals, { all: 4, food: 2, culture: 1, outdoors: 1 });
  const village = result.areas.find((area) => area.id === "village")!;
  assert.deepEqual(village.counts, {
    all: 3,
    food: 1,
    culture: 1,
    outdoors: 1,
  });
  assert.deepEqual(village.sourceCounts, {
    "nyc-dohmh-restaurants": 1,
    "nyc-facdb-culture": 1,
    "nyc-facdb-outdoors": 1,
  });
  assert.equal(
    result.sources[0].datasetUpdatedAt,
    new Date(official.rowsUpdatedAt * 1000).toISOString(),
  );
  assert.equal(Math.max(...result.areas.map((area) => area.scores.food)), 100);
  assert(
    result.areas.every((area) =>
      Object.values(area.scores).every((score) => score >= 0 && score <= 100),
    ),
  );
  assert.match(result.notice, /not what is trending/i);
});

test("a failed category is a transparent editorial fallback and leaves retrieved public counts intact", async () => {
  const mock = mockFetcher({ facilitiesUnavailable: true });
  const result = await fetchAreaHeatmap("New York", { fetcher: mock.fetcher });
  assert.equal(result.source, "mixed");
  assert.equal(result.totals.food, 2);
  assert.equal(
    result.sources.find((source) => source.category === "food")!.kind,
    "public",
  );
  assert.equal(
    result.sources.find((source) => source.category === "culture")!.kind,
    "sample",
  );
  assert(result.areas.every((area) => area.sourceKind === "mixed"));
  assert.match(result.notice, /editorial sample counts/i);
});

test("community publications and malformed API bodies cannot become trusted public data", async () => {
  const community = mockFetcher({ communityMetadata: true });
  const result = await fetchAreaHeatmap("New York", {
    fetcher: community.fetcher,
  });
  assert.equal(result.source, "editorial-demo");
  assert(
    result.sources.every(
      (source) => source.kind === "sample" && !source.datasetId,
    ),
  );
  const malformed = mockFetcher({ malformedRestaurants: true });
  const partial = await fetchAreaHeatmap("New York", {
    fetcher: malformed.fetcher,
  });
  assert.equal(
    partial.sources.find((source) => source.category === "food")!.kind,
    "sample",
  );
  assert.equal(
    partial.sources.find((source) => source.category === "culture")!.kind,
    "public",
  );
});

test("twenty-minute cache exposes retrieval time honestly and refreshes after expiry", async () => {
  const mock = mockFetcher();
  let now = 1_790_000_000_000;
  const first = await fetchAreaHeatmap("New York", {
    fetcher: mock.fetcher,
    now: () => now,
  });
  assert.equal(mock.requests(), 4);
  now += 19 * 60 * 1000;
  const cached = await fetchAreaHeatmap("NYC", {
    fetcher: mock.fetcher,
    now: () => now,
  });
  assert.equal(cached.cached, true);
  assert.equal(cached.fetchedAt, first.fetchedAt);
  assert.equal(mock.requests(), 4);
  now += 2 * 60 * 1000;
  const refreshed = await fetchAreaHeatmap("New York", {
    fetcher: mock.fetcher,
    now: () => now,
  });
  assert.equal(refreshed.cached, false);
  assert.notEqual(refreshed.fetchedAt, first.fetchedAt);
  assert.equal(mock.requests(), 8);
});

test("cities without this integration get no invented overlay or scores", async () => {
  const mock = mockFetcher();
  const result = await fetchAreaHeatmap("Tokyo, Japan", {
    fetcher: mock.fetcher,
  });
  assert.equal(result.source, "unavailable");
  assert.deepEqual(result.areas, []);
  assert.deepEqual(result.supportedCategories, []);
  assert.equal(result.totals.all, 0);
  assert.equal(mock.requests(), 0);
  const similarlyNamedCity = await fetchAreaHeatmap(
    "West New York, New Jersey",
    { fetcher: mock.fetcher },
  );
  assert.equal(similarlyNamedCity.source, "unavailable");
  assert.equal(mock.requests(), 0);
});

test("public queries expose exact bounded source URLs and deduplicate food IDs before counting", () => {
  const urls = publicHeatmapQueryUrls();
  const foodUrl = new URL(urls.restaurants);
  assert.equal(foodUrl.hostname, "data.cityofnewyork.us");
  assert.equal(foodUrl.searchParams.get("$group"), "camis,latitude,longitude");
  assert.match(foodUrl.searchParams.get("$where")!, /latitude >= 40\.719/);
  assert.equal(foodUrl.searchParams.get("$limit"), "25000");
  assert.match(
    new URL(urls.facilities).searchParams.get("$where")!,
    /CULTURAL INSTITUTIONS/,
  );
  assert.match(
    new URL(urls.facilities).searchParams.get("$where")!,
    /latitude::number >= 40\.719/,
  );
});
