import type {
  AreaDiscoveryResponse,
  DiscoveryCard,
  DiscoveryKind,
} from "../src/discoveryTypes";
import type { AreaHeatmapResponse, HeatmapCategory } from "../src/heatmapTypes";
import { NYC_HEAT_WINDOWS } from "./heatmap";

// Facts were checked against the linked first-party pages, not a live social
// feed. Pins are approximate; the venue links remain the source of details.
export const DISCOVERY_CHECKED_AT = "2026-10-10T18:03:49.000Z";
type Pick = {
  id: string;
  areaId: string;
  name: string;
  kind: DiscoveryKind;
  address: string;
  coordinates: [number, number];
  description: string;
  reason: string;
  tags: string[];
  official: string;
  evidenceUrl?: string;
  evidenceNote?: string;
};
const picks: Pick[] = [
  {
    id: "la-cabra-soho",
    areaId: "soho",
    name: "La Cabra SoHo",
    kind: "coffee",
    address: "284 Lafayette Street, New York, NY 10012",
    coordinates: [-73.9959, 40.7246],
    description:
      "Seasonal filter and espresso coffee, served around an open bar.",
    reason:
      "A focused coffee stop for a day of design shops and small galleries.",
    tags: ["Specialty coffee", "Open coffee bar"],
    official: "https://lacabra.com/pages/soho",
  },
  {
    id: "kitsune-lafayette",
    areaId: "soho",
    name: "Maison Kitsuné Lafayette",
    kind: "shop",
    address: "248 Lafayette Street, New York, NY 10012",
    coordinates: [-73.9971, 40.7232],
    description:
      "The brand’s Lafayette Street boutique, close to the SoHo coffee circuit.",
    reason:
      "A compact retail detour for someone interested in fashion and design.",
    tags: ["Brand discovery", "Fashion"],
    official: "https://maisonkitsune.com/mk/fr/boutiques/",
  },
  {
    id: "moma-design-soho",
    areaId: "soho",
    name: "MoMA Design Store SoHo",
    kind: "shop",
    address: "81 Spring Street, New York, NY 10012",
    coordinates: [-73.9979, 40.7228],
    description:
      "Everyday objects and design gifts at the museum’s Spring Street shop.",
    reason: "An easy browse between coffee and a neighborhood walk.",
    tags: ["Design objects", "Gifts"],
    official: "https://store.moma.org/pages/stores",
  },
  {
    id: "kitsune-west-village",
    areaId: "village",
    name: "Café Kitsuné West Village",
    kind: "coffee",
    address: "550 Hudson Street, New York, NY 10014",
    coordinates: [-74.0062, 40.7347],
    description:
      "Coffee and a retail browse at the brand’s Hudson Street address.",
    reason:
      "A coffee pause that pairs well with exploring the Village on foot.",
    tags: ["Coffee & design", "Hudson Street"],
    official: "https://maisonkitsune.com/mk/fr/boutiques/",
  },
  {
    id: "washington-square-discovery",
    areaId: "village",
    name: "Washington Square Park",
    kind: "outdoors",
    address: "Washington Square, New York, NY 10012",
    coordinates: [-73.9973, 40.7308],
    description: "A public park for a short reset between neighborhood stops.",
    reason:
      "A flexible outdoor pause with no reservation to fit around your plans.",
    tags: ["Public park", "Take a breather"],
    official: "https://www.nycgovparks.org/parks/washington-square-park",
  },
  {
    id: "cafe-chelsea",
    areaId: "chelsea",
    name: "Café Chelsea",
    kind: "food",
    address: "218 West 23rd Street, New York, NY 10011",
    coordinates: [-73.9966, 40.7445],
    description:
      "A French bistro in the Hotel Chelsea with an all-day dining menu.",
    reason: "A sit-down stop to balance a day of art and book browsing.",
    tags: ["Bistro", "Hotel Chelsea"],
    official: "https://hotelchelsea.com/dining-and-bar/cafe-chelsea",
    evidenceNote:
      "The official page recommends reservations and also welcomes walk-ins. Availability is not connected.",
  },
  {
    id: "printed-matter-chelsea",
    areaId: "chelsea",
    name: "Printed Matter",
    kind: "shop",
    address: "231 11th Avenue, New York, NY 10001",
    coordinates: [-74.0054, 40.7483],
    description:
      "Artists’ books and independent editions at a nonprofit bookshop.",
    reason:
      "A specific pick for print, photography and small-press design interests.",
    tags: ["Artists’ books", "Independent publishing"],
    official: "https://www.printedmatter.org/",
    evidenceUrl:
      "https://d23eqwv5slm408.cloudfront.net/api/file/qrc92H88R2qCIYLoZIA6?fit=max",
    evidenceNote:
      "The organization’s 2026 wholesale catalog identifies its Chelsea storefront. Check the venue site for current hours.",
  },
  {
    id: "little-island-discovery",
    areaId: "chelsea",
    name: "Little Island",
    kind: "outdoors",
    address: "Pier 55, Hudson River Park, New York, NY 10014",
    coordinates: [-74.01, 40.742],
    description: "A landscaped public pier with paths and river views.",
    reason: "An outdoor change of pace after shops, coffee and galleries.",
    tags: ["River views", "Public park"],
    official: "https://littleisland.org/rules-faq/",
  },
  {
    id: "colbo-les",
    areaId: "les",
    name: "Colbo",
    kind: "shop",
    address: "51 Orchard Street, New York, NY 10002",
    coordinates: [-73.9906, 40.7155],
    description:
      "Independent clothing, records and objects in a shop with a café.",
    reason:
      "A good fit for discovering smaller brands and browsing across interests.",
    tags: ["Independent brands", "Records & café"],
    official: "https://colbo.nyc/",
  },
  {
    id: "grumpy-les",
    areaId: "les",
    name: "Café Grumpy Lower East Side",
    kind: "coffee",
    address: "13 Essex Street, New York, NY 10002",
    coordinates: [-73.9892, 40.715],
    description:
      "A neighborhood coffee stop with outdoor benches and an original tile floor.",
    reason: "A small coffee break near the Orchard Street shops.",
    tags: ["Coffee pause", "Outdoor benches"],
    official: "https://cafegrumpy.com/locations/lower-east-side/",
    evidenceNote:
      "The venue’s location page lists this address and says there is no Wi-Fi.",
  },
  {
    id: "arabica-dumbo",
    areaId: "dumbo",
    name: "% Arabica DUMBO",
    kind: "coffee",
    address: "20 Old Fulton Street, Brooklyn, NY 11201",
    coordinates: [-73.9937, 40.7027],
    description: "A specialty coffee stop close to the Brooklyn waterfront.",
    reason: "Pair a coffee with a short walk along the river.",
    tags: ["Specialty coffee", "Waterfront detour"],
    official: "https://arabicacoffeeus.com/pages/locations",
  },
  {
    id: "powerhouse-dumbo",
    areaId: "dumbo",
    name: "POWERHOUSE Arena",
    kind: "shop",
    address: "28 Adams Street, Brooklyn, NY 11201",
    coordinates: [-73.9887, 40.7034],
    description: "A bookstore and event space under the DUMBO archway.",
    reason: "A book browse that adds something personal to a waterfront day.",
    tags: ["Independent bookstore", "Author events"],
    official: "https://powerhousearena.com/about-2/",
    evidenceNote:
      "The venue confirms the bookstore address. Check its own event calendar for dates and tickets.",
  },
  {
    id: "arabica-midtown",
    areaId: "midtown",
    name: "% Arabica Midtown",
    kind: "coffee",
    address: "37 West 54th Street, New York, NY 10019",
    coordinates: [-73.9767, 40.7617],
    description: "A specialty coffee stop on West 54th Street.",
    reason: "An easy coffee pause near Midtown’s museum and design stops.",
    tags: ["Specialty coffee", "West 54th Street"],
    official: "https://arabicacoffeeus.com/pages/locations",
  },
  {
    id: "moma-design-midtown",
    areaId: "midtown",
    name: "MoMA Design Store",
    kind: "shop",
    address: "44 West 53rd Street, New York, NY 10019",
    coordinates: [-73.9769, 40.761],
    description:
      "Design objects, lighting and gifts across the street from the museum.",
    reason: "A focused design browse that can fit into a shorter Midtown plan.",
    tags: ["Design objects", "Museum neighborhood"],
    official: "https://store.moma.org/pages/stores",
  },
];

const photos: Record<DiscoveryKind, string> = {
  coffee:
    "https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=850&q=85",
  shop: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=850&q=85",
  food: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=850&q=85",
  culture:
    "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=850&q=85",
  outdoors:
    "https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=850&q=85",
};

const venuePhotos: Record<string, DiscoveryCard["image"]> = {
  "la-cabra-soho": {
    url: "https://cdn.accentuate.io/94218682561/-1708421504223/Soho-location-v1733758020181.webp?675x1013=",
    alt: "La Cabra SoHo, as pictured on the venue’s own location page",
    kind: "venue",
    label: "Photo · La Cabra",
    attribution: "La Cabra official location page",
  },
  "grumpy-les": {
    url: "https://cdn11.bigcommerce.com/s-c8vytv86xy/content/CafeGrumpy-Lower-East-Side.jpg",
    alt: "Café Grumpy Lower East Side, from the venue’s own location page",
    kind: "venue",
    label: "Photo · Café Grumpy",
    attribution: "Café Grumpy official location page",
  },
};

export function editorialDiscoveryCards(
  areaId: string,
  category: HeatmapCategory = "all",
): DiscoveryCard[] {
  return picks
    .filter((pick) => pick.areaId === areaId)
    .map((pick) => {
      const cardCategory =
        pick.kind === "coffee" || pick.kind === "food"
          ? "food"
          : pick.kind === "outdoors"
            ? "outdoors"
            : "culture";
      const googleMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pick.name}, ${pick.address}`)}`;
      const tiktokSearch = `https://www.tiktok.com/search?q=${encodeURIComponent(`${pick.name} New York`)}`;
      return {
        id: pick.id,
        areaId: pick.areaId,
        name: pick.name,
        kind: pick.kind,
        category: cardCategory,
        address: pick.address,
        coordinates: [...pick.coordinates],
        description: pick.description,
        reason: pick.reason,
        tags: [...pick.tags],
        image: venuePhotos[pick.id]
          ? { ...venuePhotos[pick.id] }
          : {
              url: ["kitsune-lafayette", "colbo-les"].includes(pick.id)
                ? "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=850&q=85"
                : pick.id.startsWith("moma-design")
                  ? "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=850&q=85"
                  : photos[pick.kind],
              alt: `Representative ${pick.kind} image; not a photo of ${pick.name}`,
              kind: "representative",
              label: "Mood photo · not the venue",
              attribution: "Unsplash · representative imagery",
            },
        links: { official: pick.official, googleMaps, tiktokSearch },
        popularity: {
          status: "unavailable",
          label: "Editorial pick",
          explanation:
            "Chosen for the neighborhood and stated interests. No search-rank, visitor, trending, or social popularity measurement is connected.",
        },
        evidence: [
          {
            id: `${pick.id}-official`,
            provider: "venue",
            status: "verified-link",
            label: "Venue source checked",
            detail:
              pick.evidenceNote ||
              "Name and address checked against the venue’s own published page. The map pin is approximate. Current opening hours and availability still need a venue check.",
            url: pick.evidenceUrl || pick.official,
            checkedAt: DISCOVERY_CHECKED_AT,
          },
          {
            id: `${pick.id}-google`,
            provider: "google",
            status: "not-connected",
            label: "Google Maps lookup",
            detail:
              "This opens a Google Maps search. Ratings and review counts are not loaded until a live Places lookup succeeds; they are not a measure of searches or current crowds.",
            url: googleMaps,
            checkedAt: DISCOVERY_CHECKED_AT,
          },
          {
            id: `${pick.id}-tiktok`,
            provider: "tiktok",
            status: "not-connected",
            label: "Explore on TikTok",
            detail:
              "An external TikTok search, not a retrieved trend signal. Video mentions, views and search rankings have not been measured.",
            url: tiktokSearch,
            checkedAt: DISCOVERY_CHECKED_AT,
          },
        ],
      } satisfies DiscoveryCard;
    })
    .filter((card) => category === "all" || card.category === category);
}

export function buildAreaDiscovery(
  areaId: string,
  category: HeatmapCategory = "all",
  heatmap?: AreaHeatmapResponse,
): AreaDiscoveryResponse {
  const window = NYC_HEAT_WINDOWS.find((area) => area.id === areaId);
  const signal = heatmap?.areas.find((area) => area.id === areaId);
  return {
    success: true,
    city: "New York",
    areaId,
    areaName: window?.name || "New York",
    category,
    source: "editorial-catalog",
    checkedAt: DISCOVERY_CHECKED_AT,
    notice:
      "Neighborhood picks with first-party venue sources. The order is editorial, not a popularity ranking. Photo labels distinguish venue images from representative imagery; check venue links for current details.",
    cards: editorialDiscoveryCards(areaId, category),
    ...(signal
      ? {
          areaSignal: {
            count: signal.counts[category],
            density: signal.densities[category],
            metricLabel: heatmap!.metricLabel,
            sourceKind: signal.sourceKind,
            fetchedAt: heatmap!.fetchedAt,
          },
        }
      : {}),
  };
}
