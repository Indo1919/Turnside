import type { DiscoveryCard } from "./discoveryTypes";
import type { GooglePlaceDetails } from "./services/api";

function distanceMeters(a: [number, number], b: [number, number]) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const deltaLat = toRad(a[1] - b[1]),
    deltaLng = toRad(a[0] - b[0]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const normalizeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// A search can return the wrong branch. Keep the editorial place intact unless
// the returned name and map position both match the intended local venue.
export function applyGoogleDiscoveryEvidence(
  card: DiscoveryCard,
  place: GooglePlaceDetails,
): DiscoveryCard {
  const tokens = normalizeName(card.name)
    .split(" ")
    .filter(
      (token) =>
        ![
          "cafe",
          "coffee",
          "soho",
          "west",
          "village",
          "midtown",
          "dumbo",
          "lower",
          "east",
          "side",
          "street",
          "the",
          "new",
          "york",
        ].includes(token),
    );
  const returnedName = normalizeName(place.name);
  if (
    place.source !== "google-places" ||
    !place.coordinates ||
    place.coordinates.length !== 2 ||
    !place.coordinates.every(Number.isFinite) ||
    distanceMeters(card.coordinates, place.coordinates) > 350 ||
    !tokens.length ||
    !tokens.every((token) => returnedName.includes(token)) ||
    !Number.isFinite(Date.parse(place.fetchedAt))
  )
    throw new Error(
      "Google found a different name or branch. Use the Maps link to check this venue.",
    );
  const hasRating =
    typeof place.rating === "number" &&
    Number.isFinite(place.rating) &&
    place.rating >= 0 &&
    place.rating <= 5;
  const hasReviews =
    Number.isInteger(place.reviewCount) && place.reviewCount! >= 0;
  const signalPresent = hasRating || hasReviews;
  const sourceUrl = place.googleMapsUri || card.links.googleMaps;
  return {
    ...card,
    coordinates: place.coordinates,
    links: { ...card.links, googleMaps: sourceUrl },
    popularity: signalPresent
      ? {
          status: "google-review-signal",
          label: "Google review signal",
          explanation:
            "Google Maps rating and review count retrieved for this venue. Reviews reflect contributor feedback; they do not measure search rank, visits, current crowds, or TikTok trends.",
          ...(hasRating ? { rating: place.rating } : {}),
          ...(hasReviews ? { reviewCount: place.reviewCount } : {}),
          fetchedAt: place.fetchedAt,
          sourceUrl,
        }
      : {
          ...card.popularity,
          label: "Google listing matched",
          explanation:
            "Google matched this venue but did not return a rating or review count. No popularity value has been inferred.",
          fetchedAt: place.fetchedAt,
          sourceUrl,
        },
    evidence: [
      ...card.evidence.filter((e) => e.provider !== "google"),
      {
        id: `${card.id}-google`,
        provider: "google",
        status: "live",
        label: signalPresent
          ? "Google Maps review signal"
          : "Google Maps listing matched",
        detail: signalPresent
          ? "Name and nearby location matched. Review data was retrieved on demand from the Google Places API; it is not a measure of search demand or busyness."
          : "Name and nearby location matched. No rating or review count was provided.",
        url: sourceUrl,
        checkedAt: place.fetchedAt,
        ...(hasReviews
          ? { metric: { value: place.reviewCount!, unit: "Google reviews" } }
          : {}),
      },
      ...place.attributions.map((a, index) => ({
        id: `${card.id}-attribution-${index}`,
        provider: "google" as const,
        status: "live" as const,
        label: a.provider,
        detail: "Additional attribution supplied by Google Maps.",
        url: a.providerUri || sourceUrl,
        checkedAt: place.fetchedAt,
      })),
    ],
  };
}
