import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAreaDiscovery,
  editorialDiscoveryCards,
} from "../backend/discovery";
import { NYC_HEAT_WINDOWS } from "../backend/heatmap";
import { applyGoogleDiscoveryEvidence } from "../src/discoveryEvidence";
import type { GooglePlaceDetails } from "../src/services/api";
import type { AreaHeatmapResponse } from "../src/heatmapTypes";

test("all six areas have sourced editorial picks without inferred popularity or fake venue photos", () => {
  for (const area of NYC_HEAT_WINDOWS) {
    const cards = editorialDiscoveryCards(area.id);
    assert(cards.length >= 2);
    assert(
      cards.some((card) => card.kind === "coffee" || card.kind === "food"),
    );
    for (const card of cards) {
      assert.equal(card.popularity.status, "unavailable");
      assert.equal(card.popularity.rating, undefined);
      assert.equal(card.popularity.reviewCount, undefined);
      assert(
        card.evidence.some(
          (source) =>
            source.provider === "venue" && source.status === "verified-link",
        ),
      );
      assert(
        card.evidence
          .filter(
            (source) =>
              source.provider === "google" || source.provider === "tiktok",
          )
          .every((source) => source.status === "not-connected"),
      );
      assert.equal(new URL(card.links.official).protocol, "https:");
      assert(
        card.coordinates[0] >= area.bounds[0] &&
          card.coordinates[0] < area.bounds[2],
      );
      assert(
        card.coordinates[1] >= area.bounds[1] &&
          card.coordinates[1] < area.bounds[3],
      );
      if (card.image.kind === "representative")
        assert.match(card.image.label, /not the venue/);
      if (card.image.kind === "venue")
        assert.match(card.image.attribution, /official location page/);
    }
  }
});

test("area signal keeps public inventory counts distinct from recommendation selection counts", () => {
  const heatmap = {
    metricLabel: "Listed place density",
    fetchedAt: "2026-10-10T18:00:00Z",
    areas: [
      {
        id: "soho",
        counts: { all: 602, food: 507, culture: 70, outdoors: 25 },
        densities: { all: 551, food: 462, culture: 63, outdoors: 23 },
        sourceKind: "public",
      },
    ],
  } as AreaHeatmapResponse;
  const result = buildAreaDiscovery("soho", "food", heatmap);
  assert.equal(result.areaSignal!.count, 507);
  assert.equal(result.areaSignal!.density, 462);
  assert.equal(result.cards.length, 1);
  assert(result.cards.every((card) => card.category === "food"));
  assert.match(result.notice, /not a popularity ranking/);
});

const card = editorialDiscoveryCards("soho", "food")[0];
const google = (
  patch: Partial<GooglePlaceDetails> = {},
): GooglePlaceDetails => ({
  name: "La Cabra",
  coordinates: card.coordinates,
  rating: 4.5,
  reviewCount: 348,
  source: "google-places",
  attribution: "Google Maps",
  attributions: [],
  fetchedAt: "2026-10-10T18:10:00Z",
  ...patch,
});

test("a matched live Places result exposes actual rating, review count and retrieval attribution", () => {
  const enriched = applyGoogleDiscoveryEvidence(card, google());
  assert.equal(enriched.popularity.status, "google-review-signal");
  assert.equal(enriched.popularity.rating, 4.5);
  assert.equal(enriched.popularity.reviewCount, 348);
  assert.equal(
    enriched.evidence.find((source) => source.provider === "google")!.status,
    "live",
  );
  assert.match(enriched.popularity.explanation, /do not measure search rank/);
  assert.equal(card.popularity.status, "unavailable");
});

test("review evidence keeps independently sourced itinerary coordinates", () => {
  const matchedCoordinates: [number, number] = [
    card.coordinates[0] + 0.0001,
    card.coordinates[1],
  ];
  const enriched = applyGoogleDiscoveryEvidence(
    card,
    google({ coordinates: matchedCoordinates }),
  );
  assert.equal(enriched.popularity.status, "google-review-signal");
  assert.deepEqual(enriched.coordinates, card.coordinates);
  assert.notDeepEqual(enriched.coordinates, matchedCoordinates);
});

test("wrong branches, wrong brands and missing venue location cannot inherit a popularity signal", () => {
  assert.throws(
    () =>
      applyGoogleDiscoveryEvidence(
        card,
        google({ coordinates: [-73.9882, 40.7296] }),
      ),
    /different name or branch/,
  );
  assert.throws(
    () =>
      applyGoogleDiscoveryEvidence(
        card,
        google({ name: "Another coffee shop" }),
      ),
    /different name or branch/,
  );
  assert.throws(
    () =>
      applyGoogleDiscoveryEvidence(card, google({ coordinates: undefined })),
    /different name or branch/,
  );
  assert.throws(
    () => applyGoogleDiscoveryEvidence(card, google({ fetchedAt: "unknown" })),
    /different name or branch/,
  );
  assert.throws(
    () =>
      applyGoogleDiscoveryEvidence(
        card,
        google({ coordinates: [-73.9959] as any }),
      ),
    /different name or branch/,
  );
});

test("a matched listing with absent or invalid review fields never invents zeroes or a rating", () => {
  const noReviews = applyGoogleDiscoveryEvidence(
    card,
    google({ rating: undefined, reviewCount: undefined }),
  );
  assert.equal(noReviews.popularity.status, "unavailable");
  assert.equal(noReviews.popularity.rating, undefined);
  assert.equal(noReviews.popularity.reviewCount, undefined);
  const invalid = applyGoogleDiscoveryEvidence(
    card,
    google({ rating: 9, reviewCount: -2 }),
  );
  assert.equal(invalid.popularity.status, "unavailable");
});
