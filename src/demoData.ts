import type { CategoryType, ItineraryStop, TripPlan } from "./types";

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  cafe: "Coffee & bakeries",
  culture: "Art & culture",
  dining: "Food & drink",
  niche: "Independent shops",
  nightlife: "After hours",
  nature: "Parks & outdoors",
  transit: "Getting there",
};

// Editorial demonstration plan. Times, durations and coordinates are planning
// estimates; current opening hours and availability belong to the venue.
// Legacy scoring fields are deliberately zero and must not be shown as evidence.
const stop = (
  value: Omit<ItineraryStop, "localSecretScore" | "touristTrapRisk">,
): ItineraryStop => ({
  ...value,
  localSecretScore: 0,
  touristTrapRisk: 0,
});

export const VENUE_URLS: Record<string, string> = {
  "La Cabra SoHo": "https://us.lacabra.com/pages/soho",
  "McNally Jackson SoHo": "https://www.mcnallyjackson.com/store/1",
  Dante: "https://www.dante-nyc.com/",
  "Washington Square Park":
    "https://www.nycgovparks.org/parks/washington-square-park",
  "Whitney Museum": "https://whitney.org/visit",
  "Brooklyn Bridge Park": "https://brooklynbridgepark.org/",
  "Jane’s Carousel": "https://janescarousel.com/",
  "Time Out Market New York":
    "https://www.timeout.com/time-out-market-new-york/how-to-get-here",
  "Brooklyn Heights Promenade":
    "https://nycgovparks.org/parks/brooklyn-heights-promenade",
  "The Met Fifth Avenue": "https://www.metmuseum.org/plan-your-visit",
  "Café Sabarsky": "https://www.neuegalerie.org/cafesabarsky",
  "Solomon R. Guggenheim Museum": "https://www.guggenheim.org/plan-your-visit",
  "Central Park Reservoir":
    "https://www.centralparknyc.org/locations/reservoir",
  "The Drawing Center": "https://drawingcenter.org/visit",
  "Housing Works Bookstore": "https://shop.housingworks.org/nyc-bookstore/",
  "Maman SoHo": "https://mamannyc.com/locations",
  "Little Island": "https://littleisland.org/rules-faq/",
  "The High Line": "https://www.thehighline.org/visit/",
  "Strand Book Store": "https://www.strandbooks.com/",
};

export const INITIAL_TRIP: TripPlan = {
  source: "demo",
  timeZone: "America/New_York",
  city: "New York",
  center: [-74.0001, 40.7308],
  zoom: 13.7,
  summary:
    "Good coffee, independent places, and a little room to wander. Three thoughtful days in New York.",
  vibe: "Art, coffee & unhurried exploring",
  days: [
    {
      dayNumber: 1,
      title: "SoHo to the West Village",
      date: "2026-10-10",
      stops: [
        stop({
          id: "nyc-lacabra",
          title: "La Cabra SoHo",
          time: "09:00 AM",
          durationMinutes: 45,
          category: "cafe",
          categoryLabel: "Specialty coffee",
          coordinates: [-73.9954, 40.7238],
          address: "284 Lafayette Street, New York, NY 10012",
          description:
            "A focused coffee bar on Lafayette Street. Start slowly with a filter coffee or an espresso.",
          insiderSecret:
            "Editorial demo tip: this location does not take table reservations. Leave a little flexibility for your coffee stop.",
          ticketRequired: false,
          estimatedCost: "Menu prices vary",
          status: "completed",
        }),
        stop({
          id: "nyc-mcnally",
          title: "McNally Jackson SoHo",
          time: "10:30 AM",
          durationMinutes: 50,
          category: "niche",
          categoryLabel: "Independent bookshop",
          coordinates: [-74.0003, 40.7258],
          address: "134 Prince Street, New York, NY 10012",
          description:
            "Browse an independent bookstore on Prince Street, with space for a good find and an unhurried read.",
          insiderSecret:
            "Editorial demo tip: give yourself one shelf to explore without a shopping list. Check the store calendar for readings.",
          ticketRequired: false,
          estimatedCost: "Free to browse",
          status: "current",
        }),
        stop({
          id: "nyc-dante",
          title: "Dante",
          time: "12:30 PM",
          durationMinutes: 75,
          category: "dining",
          categoryLabel: "Village café & dining",
          coordinates: [-74.0015, 40.7286],
          address: "79–81 MacDougal Street, New York, NY 10012",
          description:
            "Pause for lunch in Greenwich Village before heading toward the park.",
          insiderSecret:
            "Editorial demo tip: reservations are suggested and walk-ins are welcome. Confirm a table directly with the restaurant.",
          ticketRequired: false,
          estimatedCost: "See restaurant menu",
          status: "upcoming",
        }),
        stop({
          id: "nyc-washington",
          title: "Washington Square Park",
          time: "02:00 PM",
          durationMinutes: 45,
          category: "nature",
          categoryLabel: "Park break",
          coordinates: [-73.9973, 40.7308],
          address: "Washington Square, New York, NY 10012",
          description:
            "An easy pause around the arch and fountain before a walk through the Village.",
          insiderSecret:
            "Editorial demo tip: use this as your flexible stop. Stay longer if the day feels right, or keep time for the museum.",
          ticketRequired: false,
          estimatedCost: "Free",
          status: "upcoming",
        }),
        stop({
          id: "nyc-whitney",
          title: "Whitney Museum",
          time: "03:30 PM",
          durationMinutes: 120,
          category: "culture",
          categoryLabel: "American art",
          coordinates: [-74.0089, 40.7396],
          address: "99 Gansevoort Street, New York, NY 10014",
          description:
            "Finish with American art and a view toward the Hudson from the Meatpacking District.",
          insiderSecret:
            "Editorial demo tip: book through the museum and review free or discounted admission eligibility before paying.",
          ticketRequired: true,
          ticketCost: "Check current admission",
          bookingSlot: "03:30 PM",
          status: "upcoming",
        }),
      ],
    },
    {
      dayNumber: 2,
      title: "A Brooklyn waterfront day",
      date: "2026-10-11",
      stops: [
        stop({
          id: "nyc-bbp",
          title: "Brooklyn Bridge Park",
          time: "09:30 AM",
          durationMinutes: 70,
          category: "nature",
          categoryLabel: "Waterfront walk",
          coordinates: [-73.9898, 40.7043],
          address: "Main Street entrance, Brooklyn, NY 11201",
          description:
            "Start along the DUMBO waterfront, with bridge views and room to slow down.",
          insiderSecret:
            "Editorial demo tip: the park is free to enter. Use the official park map to find facilities and step-free access.",
          ticketRequired: false,
          estimatedCost: "Free",
          status: "upcoming",
        }),
        stop({
          id: "nyc-carousel",
          title: "Jane’s Carousel",
          time: "11:00 AM",
          durationMinutes: 30,
          category: "culture",
          categoryLabel: "Waterfront landmark",
          coordinates: [-73.9938, 40.7057],
          address:
            "Empire Fulton Ferry, Brooklyn Bridge Park, Brooklyn, NY 11201",
          description:
            "A restored carousel in a glass pavilion beside the East River. Ride if it takes your fancy.",
          insiderSecret:
            "Editorial demo tip: check seasonal opening hours with the carousel. A ride is optional; the surrounding park is free.",
          ticketRequired: true,
          ticketCost: "Check current ride price",
          status: "upcoming",
        }),
        stop({
          id: "nyc-timeout",
          title: "Time Out Market New York",
          time: "12:00 PM",
          durationMinutes: 75,
          category: "dining",
          categoryLabel: "Food hall",
          coordinates: [-73.9918, 40.7033],
          address: "55 Water Street, Brooklyn, NY 11201",
          description:
            "Choose lunch together at the food hall in Empire Stores, with waterfront space close by.",
          insiderSecret:
            "Editorial demo tip: the food hall has several entrances. Check individual vendor hours when choosing lunch.",
          ticketRequired: false,
          estimatedCost: "Vendor prices vary",
          status: "upcoming",
        }),
        stop({
          id: "nyc-promenade",
          title: "Brooklyn Heights Promenade",
          time: "02:30 PM",
          durationMinutes: 60,
          category: "nature",
          categoryLabel: "Skyline stroll",
          coordinates: [-73.9975, 40.6962],
          address: "Columbia Heights at Montague Street, Brooklyn, NY 11201",
          description:
            "Walk up into Brooklyn Heights for a different perspective on Lower Manhattan.",
          insiderSecret:
            "Editorial demo tip: the promenade sits above the waterfront. Check the route if stairs or hills are a concern.",
          ticketRequired: false,
          estimatedCost: "Free",
          status: "upcoming",
        }),
      ],
    },
    {
      dayNumber: 3,
      title: "Art along Fifth Avenue",
      date: "2026-10-12",
      stops: [
        stop({
          id: "nyc-met",
          title: "The Met Fifth Avenue",
          time: "10:00 AM",
          durationMinutes: 150,
          category: "culture",
          categoryLabel: "Museum morning",
          coordinates: [-73.9632, 40.7794],
          address: "1000 Fifth Avenue, New York, NY 10028",
          description:
            "Choose a few galleries and enjoy them well, rather than trying to see the entire museum.",
          insiderSecret:
            "Editorial demo tip: admission rules depend on residency and eligibility. Check the museum’s official ticket information.",
          ticketRequired: true,
          ticketCost: "Check admission eligibility",
          bookingSlot: "10:00 AM",
          status: "upcoming",
        }),
        stop({
          id: "nyc-sabarsky",
          title: "Café Sabarsky",
          time: "12:45 PM",
          durationMinutes: 75,
          category: "dining",
          categoryLabel: "Viennese café",
          coordinates: [-73.9604, 40.7813],
          address: "1048 Fifth Avenue, New York, NY 10028",
          description:
            "A Viennese-inspired café for lunch and a pause between museums.",
          insiderSecret:
            "Editorial demo tip: breakfast and lunch are first-come, first-served. Café opening hours differ from the museum galleries.",
          ticketRequired: false,
          estimatedCost: "See café menu",
          status: "upcoming",
        }),
        stop({
          id: "nyc-guggenheim",
          title: "Solomon R. Guggenheim Museum",
          time: "02:15 PM",
          durationMinutes: 90,
          category: "culture",
          categoryLabel: "Art & architecture",
          coordinates: [-73.959, 40.783],
          address: "1071 Fifth Avenue, New York, NY 10128",
          description:
            "Continue north for contemporary and modern art in Frank Lloyd Wright’s landmark building.",
          insiderSecret:
            "Editorial demo tip: exhibition changeovers can affect access. Check the museum calendar before purchasing tickets.",
          ticketRequired: true,
          ticketCost: "Check current admission",
          bookingSlot: "02:15 PM",
          status: "upcoming",
        }),
        stop({
          id: "nyc-reservoir",
          title: "Central Park Reservoir",
          time: "04:00 PM",
          durationMinutes: 60,
          category: "nature",
          categoryLabel: "Open-air finish",
          coordinates: [-73.9581, 40.785],
          address:
            "East 90th Street entrance, Central Park, New York, NY 10128",
          description:
            "Leave the last hour open for a walk beside the reservoir and a skyline view.",
          insiderSecret:
            "Editorial demo tip: this stop is weather-dependent. The reservoir has no restrooms; check nearby facilities first.",
          ticketRequired: false,
          estimatedCost: "Free",
          status: "upcoming",
        }),
      ],
    },
  ],
  trendyHotspots: [
    {
      id: "discover-drawing",
      name: "The Drawing Center",
      coordinates: [-74.0029, 40.7222],
      category: "culture",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Editorial demo pick • check venue details",
      badge: "Art stop",
      story:
        "A compact SoHo museum focused on drawing, with free admission and a changing exhibition calendar.",
      insiderTip:
        "Check the current exhibition and any installation closures before adding it to your day.",
    },
    {
      id: "discover-housing",
      name: "Housing Works Bookstore",
      coordinates: [-73.9966, 40.7246],
      category: "niche",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Editorial demo pick • check venue details",
      badge: "Bookshop detour",
      story:
        "Secondhand books, records, and coffee in a SoHo bookstore supporting Housing Works.",
      insiderTip:
        "Check the event calendar and opening hours; the selection changes with donations.",
    },
    {
      id: "discover-maman",
      name: "Maman SoHo",
      coordinates: [-73.9981, 40.7209],
      category: "cafe",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Editorial demo pick • check venue details",
      badge: "Coffee break",
      story:
        "A café and bakery on Centre Street, close enough for a short break while exploring SoHo.",
      insiderTip:
        "The kitchen closes before the café. Check the menu if you are looking for a full meal.",
    },
    {
      id: "discover-island",
      name: "Little Island",
      coordinates: [-74.0101, 40.742],
      category: "nature",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Editorial demo pick • check venue details",
      badge: "By the water",
      story:
        "A public park above the Hudson, with winding paths and an easy connection to the waterfront.",
      insiderTip:
        "Park entry is free; performances may need a separate ticket. Check weather-related closures.",
    },
    {
      id: "discover-highline",
      name: "The High Line",
      coordinates: [-74.008, 40.74],
      category: "nature",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Editorial demo pick • check venue details",
      badge: "Walk a little further",
      story:
        "An elevated park above the West Side, convenient for extending your Whitney Museum afternoon.",
      insiderTip:
        "Enter at West 14th Street. Confirm elevator availability if you need step-free access.",
    },
    {
      id: "discover-strand",
      name: "Strand Book Store",
      coordinates: [-73.9908, 40.7333],
      category: "niche",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Editorial demo pick • check venue details",
      badge: "Worth a browse",
      story:
        "A long-established independent bookstore near Union Square for new, used, and art books.",
      insiderTip:
        "Check the store’s own event calendar for ticketed author talks and special programs.",
    },
  ],
};

// Sample mood photographs from Unsplash, not photographs of the named venues.
// Consumer components should expose that distinction in captions or alt text.
const MOOD_IMAGES = {
  cafe: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1000&q=85",
  culture:
    "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=1000&q=85",
  dining:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1000&q=85",
  niche:
    "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1000&q=85",
  nature:
    "https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=1000&q=85",
  nightlife:
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1000&q=85",
  transit:
    "https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=1000&q=85",
};

export function placeImage(place: {
  title?: string;
  name?: string;
  category?: string;
}): string {
  const category = place.category as CategoryType;
  return MOOD_IMAGES[category] ?? MOOD_IMAGES.nature;
}
