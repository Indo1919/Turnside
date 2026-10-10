import type { ItineraryStop, TripPlan } from "../src/types";
import { INITIAL_TRIP, VENUE_URLS } from "../src/demoData";

export type Place = ItineraryStop & {
  sourceUrl: string;
  bookingUrl?: string;
  sourceLabel: string;
  neighborhood: string;
};
export type Catalog = {
  city: string;
  center: [number, number];
  timezone: string;
  summary: string;
  places: Place[];
};

function place(
  id: string,
  title: string,
  coordinates: [number, number],
  category: ItineraryStop["category"],
  neighborhood: string,
  address: string,
  description: string,
  sourceUrl: string,
  durationMinutes = 60,
  bookingUrl?: string,
): Place {
  return {
    id,
    title,
    coordinates,
    category,
    categoryLabel: {
      cafe: "Coffee",
      culture: "Art & culture",
      dining: "Food",
      niche: "Independent shops",
      nightlife: "Evening",
      nature: "Outdoors",
      transit: "Transit",
    }[category],
    neighborhood,
    address,
    description,
    sourceUrl,
    sourceLabel: "Venue / destination information",
    bookingUrl,
    durationMinutes,
    time: "09:00 AM",
    insiderSecret:
      "Check the linked venue page for current hours and access before visiting.",
    localSecretScore: 0,
    touristTrapRisk: 0,
    ticketRequired: Boolean(bookingUrl),
    estimatedCost: bookingUrl
      ? "See venue pricing"
      : category === "nature"
        ? "Free public access; check hours"
        : "Pay at venue",
    status: "upcoming",
  };
}

// Editorial sample itineraries, not live availability or measured popularity.
// Coordinates are approximate entrance locations. Official links let travelers
// check the venue directly; no fabricated passwords, perks, or bookings.
export const CATALOGS: Record<string, Catalog> = {
  tokyo: {
    city: "Tokyo, Japan",
    center: [139.6995, 35.6624],
    timezone: "Asia/Tokyo",
    summary:
      "Coffee in Tomigaya, art in Aoyama, and time to browse the quieter side of Tokyo. A flexible sample day with room for a detour.",
    places: [
      place(
        "tokyo-fuglen",
        "Fuglen Tokyo",
        [139.6917, 35.6634],
        "cafe",
        "Tomigaya",
        "1-16-11 Tomigaya, Shibuya, Tokyo",
        "A Norwegian café and bar with vintage furniture, a relaxed neighborhood setting, and coffee to start your day.",
        "https://fuglen.no/",
      ),
      place(
        "tokyo-nezu",
        "Nezu Museum",
        [139.7178, 35.6624],
        "culture",
        "Aoyama",
        "6-5-1 Minamiaoyama, Minato, Tokyo",
        "Asian art, a distinctive museum building, and a Japanese garden make a calm pause in Aoyama.",
        "https://www.nezu-muse.or.jp/en/",
        90,
        "https://www.nezu-muse.or.jp/en/",
      ),
      place(
        "tokyo-afuri",
        "AFURI Harajuku",
        [139.7064, 35.6712],
        "dining",
        "Harajuku",
        "3-63-1 Sendagaya, Shibuya, Tokyo",
        "A casual ramen stop known for its citrus-forward yuzu broth. Allow time for a possible queue.",
        "https://afuri.com/",
        60,
      ),
      place(
        "tokyo-tsite",
        "Daikanyama T-Site",
        [139.6998, 35.6492],
        "niche",
        "Daikanyama",
        "17-5 Sarugakucho, Shibuya, Tokyo",
        "Browse books, design, and photography across the interconnected Tsutaya buildings.",
        "https://store.tsite.jp/daikanyama/",
        75,
      ),
      place(
        "tokyo-trench",
        "Bar Trench",
        [139.7088, 35.6468],
        "nightlife",
        "Ebisu",
        "1-5-8 Ebisunishi, Shibuya, Tokyo",
        "An intimate Ebisu cocktail bar. Check the venue directly for opening hours and its seating policy.",
        "https://small-axe.net/",
        90,
        "https://small-axe.net/",
      ),
      place(
        "tokyo-yoyogi",
        "Yoyogi Park",
        [139.6949, 35.6715],
        "nature",
        "Yoyogi",
        "2-1 Yoyogikamizonocho, Shibuya, Tokyo",
        "Open lawns and tree-lined paths for an unhurried walk near Harajuku.",
        "https://www.tokyo-park.or.jp/park/yoyogi/",
        60,
      ),
      place(
        "tokyo-mori",
        "Mori Art Museum",
        [139.7292, 35.6605],
        "culture",
        "Roppongi",
        "6-10-1 Roppongi, Minato, Tokyo",
        "Contemporary exhibitions high above Roppongi. Exhibition schedules and admission vary.",
        "https://www.mori.art.museum/en/",
        90,
        "https://www.mori.art.museum/en/",
      ),
      place(
        "tokyo-koffee",
        "KOFFEE MAMEYA",
        [139.7084, 35.6654],
        "cafe",
        "Omotesando",
        "4-15-3 Jingumae, Shibuya, Tokyo",
        "A focused coffee tasting stop in Omotesando for people who enjoy exploring different beans.",
        "https://www.koffee-mameya.com/",
        45,
      ),
      place(
        "tokyo-meiji",
        "Meiji Jingu",
        [139.6993, 35.6764],
        "culture",
        "Harajuku",
        "1-1 Yoyogikamizonocho, Shibuya, Tokyo",
        "A forested approach and spacious shrine grounds offer a quieter stretch of the city.",
        "https://www.meijijingu.or.jp/en/",
        75,
      ),
    ],
  },
  paris: {
    city: "Paris, France",
    center: [2.3585, 48.8637],
    timezone: "Europe/Paris",
    summary:
      "A neighborhood-led Paris day: a bakery stop, a smaller museum, and a wander through covered passages. Sample timings leave space to linger.",
    places: [
      place(
        "paris-pain",
        "Du Pain et des Idées",
        [2.3629, 48.8711],
        "cafe",
        "Canal Saint-Martin",
        "34 Rue Yves Toudic, 75010 Paris",
        "A neighborhood bakery near Canal Saint-Martin. Choose a pastry and walk to the canal.",
        "https://dupainetdesidees.com/",
        45,
      ),
      place(
        "paris-chasse",
        "Musée de la Chasse et de la Nature",
        [2.3592, 48.8604],
        "culture",
        "Le Marais",
        "62 Rue des Archives, 75003 Paris",
        "Art and nature collections within historic Marais buildings. Check the current exhibition and museum hours.",
        "https://www.chassenature.org/",
        90,
        "https://chassenature.tickeasy.com/",
      ),
      place(
        "paris-rouges",
        "Marché des Enfants Rouges",
        [2.3631, 48.8631],
        "dining",
        "Le Marais",
        "39 Rue de Bretagne, 75003 Paris",
        "A covered neighborhood market with a choice of lunch counters. Choose on arrival rather than commit to a fixed menu.",
        "https://www.paris.fr/",
        75,
      ),
      place(
        "paris-panoramas",
        "Passage des Panoramas",
        [2.3414, 48.8715],
        "niche",
        "Grands Boulevards",
        "11 Boulevard Montmartre, 75002 Paris",
        "A covered passage with small shops and restaurants, ideal for a slower afternoon or a rainy detour.",
        "https://parisjetaime.com/",
        60,
      ),
      place(
        "paris-candelaria",
        "Candelaria",
        [2.3644, 48.8629],
        "nightlife",
        "Le Marais",
        "52 Rue de Saintonge, 75003 Paris",
        "A taqueria and cocktail bar in the Marais. Check its current service hours and reservation options.",
        "https://www.candelaria-paris.com/",
        90,
        "https://www.candelaria-paris.com/",
      ),
      place(
        "paris-vosges",
        "Place des Vosges",
        [2.3655, 48.8556],
        "nature",
        "Le Marais",
        "Place des Vosges, 75004 Paris",
        "A leafy square framed by red-brick arcades; a relaxed place to sit between stops.",
        "https://parisjetaime.com/",
        45,
      ),
      place(
        "paris-carnavalet",
        "Musée Carnavalet",
        [2.3625, 48.8578],
        "culture",
        "Le Marais",
        "23 Rue de Sévigné, 75003 Paris",
        "Paris history across two historic mansions. Verify admission rules for permanent and temporary exhibitions.",
        "https://www.carnavalet.paris.fr/en",
        90,
      ),
      place(
        "paris-palais",
        "Palais-Royal Garden",
        [2.3373, 48.8653],
        "nature",
        "Palais-Royal",
        "8 Rue de Montpensier, 75001 Paris",
        "Garden paths, arcades, and the striped columns around the Palais-Royal courtyard.",
        "https://www.domaine-palais-royal.fr/",
        60,
      ),
      place(
        "paris-bnf",
        "BnF Richelieu",
        [2.3386, 48.8675],
        "culture",
        "Richelieu",
        "5 Rue Vivienne, 75002 Paris",
        "A historic library site with a public reading room and museum. Check which spaces require museum admission.",
        "https://www.bnf.fr/en/richelieu",
        75,
        "https://www.bnf.fr/en/richelieu",
      ),
    ],
  },
  newyork: {
    city: "New York, USA",
    center: [-73.9941, 40.7338],
    timezone: "America/New_York",
    summary:
      "An easygoing New York day of coffee, art, neighborhood walks, and music. This sample itinerary favors pauses over a packed checklist.",
    places: [
      place(
        "nyc-stumptown",
        "Stumptown Coffee — Greenwich Village",
        [-73.9984, 40.7329],
        "cafe",
        "Greenwich Village",
        "30 W 8th St, New York, NY",
        "A coffee stop near Washington Square before exploring the Village on foot.",
        "https://www.stumptowncoffee.com/",
        45,
      ),
      place(
        "nyc-morgan",
        "The Morgan Library & Museum",
        [-73.9814, 40.7493],
        "culture",
        "Murray Hill",
        "225 Madison Ave, New York, NY 10016",
        "Historic library rooms and changing exhibitions. Advance timed tickets are suggested by the museum.",
        "https://www.themorgan.org/visit",
        90,
        "https://www.themorgan.org/visit",
      ),
      place(
        "nyc-chelsea",
        "Chelsea Market",
        [-74.006, 40.7424],
        "dining",
        "Chelsea",
        "75 9th Ave, New York, NY",
        "An indoor food market with many lunch choices and room to explore without choosing a restaurant in advance.",
        "https://www.chelseamarket.com/",
        75,
      ),
      place(
        "nyc-highline",
        "The High Line",
        [-74.0047, 40.7476],
        "nature",
        "Chelsea",
        "High Line at W 23rd St, New York, NY",
        "An elevated walking route with planted gardens, city views, and contemporary art.",
        "https://www.thehighline.org/",
        60,
      ),
      place(
        "nyc-smalls",
        "Smalls Jazz Club",
        [-74.0028, 40.7342],
        "nightlife",
        "West Village",
        "183 W 10th St, New York, NY",
        "A small basement jazz venue. Choose an actual performance and entry time on the club website.",
        "https://www.smallslive.com/",
        90,
        "https://www.smallslive.com/",
      ),
      place(
        "nyc-washington",
        "Washington Square Park",
        [-73.9973, 40.7308],
        "nature",
        "Greenwich Village",
        "Washington Square, New York, NY",
        "Pause by the fountain, watch the square, or take a short walk beneath the arch.",
        "https://www.nycgovparks.org/parks/washington-square-park",
        45,
      ),
      place(
        "nyc-whitney",
        "Whitney Museum of American Art",
        [-74.0094, 40.7396],
        "culture",
        "Meatpacking District",
        "99 Gansevoort St, New York, NY",
        "American art and changing exhibitions near the southern end of the High Line.",
        "https://whitney.org/visit",
        90,
        "https://whitney.org/visit",
      ),
      place(
        "nyc-mcnally",
        "McNally Jackson — SoHo",
        [-73.9974, 40.7243],
        "niche",
        "SoHo",
        "134 Prince St, New York, NY",
        "An independent bookstore with plenty to browse while wandering SoHo.",
        "https://www.mcnallyjackson.com/",
        60,
      ),
      place(
        "nyc-dumpling",
        "Nom Wah Tea Parlor",
        [-73.9981, 40.7145],
        "dining",
        "Chinatown",
        "13 Doyers St, New York, NY",
        "A historic Chinatown dim sum stop on Doyers Street. Check its current walk-in and service arrangements.",
        "https://nomwah.com/",
        75,
      ),
    ],
  },
};

// Keep the backend planning catalog and the visible New York demo aligned.
CATALOGS.newyork = {
  city: INITIAL_TRIP.city,
  center: INITIAL_TRIP.center,
  timezone: "America/New_York",
  summary: INITIAL_TRIP.summary,
  places: INITIAL_TRIP.days.flatMap((day) =>
    day.stops.map((stop) => ({
      ...stop,
      status: "upcoming" as const,
      sourceUrl:
        VENUE_URLS[stop.title] ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.title} New York`)}`,
      sourceLabel: "Official venue information",
      neighborhood: day.title,
      bookingUrl:
        stop.ticketRequired || stop.title === "Dante"
          ? VENUE_URLS[stop.title]
          : undefined,
    })),
  ),
};

type DemoDay = { title: string; stops: Place[] };
function scheduledPlaces(key: string, entries: [number, string][]): Place[] {
  return entries.map(([index, time]) => ({
    ...CATALOGS[key].places[index],
    time,
  }));
}
// These are suggested appointment times, not checked opening-hour data.
// Keep the curated city/day grouping rather than starting every venue at 9am.
const DEMO_DAYS: Record<string, DemoDay[]> = {
  newyork: INITIAL_TRIP.days.map((day) => ({
    title: day.title,
    stops: day.stops.map((stop) =>
      CATALOGS.newyork.places.find((place) => place.id === stop.id)!,
    ),
  })),
  tokyo: [
    {
      title: "Coffee, art & design",
      stops: scheduledPlaces("tokyo", [
        [0, "09:00 AM"],
        [1, "11:00 AM"],
        [2, "01:00 PM"],
        [3, "03:00 PM"],
        [4, "07:00 PM"],
      ]),
    },
    {
      title: "A quieter Harajuku morning",
      stops: scheduledPlaces("tokyo", [
        [7, "09:30 AM"],
        [5, "11:00 AM"],
      ]),
    },
    {
      title: "Forest paths and contemporary art",
      stops: scheduledPlaces("tokyo", [
        [8, "09:30 AM"],
        [6, "01:30 PM"],
      ]),
    },
  ],
  paris: [
    {
      title: "Canal Saint-Martin to the Marais",
      stops: scheduledPlaces("paris", [
        [0, "09:00 AM"],
        [1, "11:00 AM"],
        [2, "01:00 PM"],
        [3, "03:00 PM"],
        [4, "07:00 PM"],
      ]),
    },
    {
      title: "Paris history and a garden pause",
      stops: scheduledPlaces("paris", [
        [6, "11:00 AM"],
        [5, "01:00 PM"],
      ]),
    },
    {
      title: "A library and the Palais-Royal",
      stops: scheduledPlaces("paris", [
        [8, "11:00 AM"],
        [7, "01:00 PM"],
      ]),
    },
  ],
};

export function cityKeyFor(value = ""): string | undefined {
  if (value.includes("東京")) return "tokyo";
  if (/\bnyc\b|\bny\b|manhattan/i.test(value)) return "newyork";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (normalized.includes("tokyo") || normalized.includes("東京"))
    return "tokyo";
  if (normalized.includes("paris")) return "paris";
  if (
    normalized.includes("newyork") ||
    normalized === "nyc" ||
    normalized === "ny" ||
    normalized.includes("manhattan")
  )
    return "newyork";
  return undefined;
}

export function buildDemoTrip(params: {
  destination: string;
  vibe?: string;
  durationDays?: number;
  pacing?: string;
  startDate?: string;
}): TripPlan & {
  timezone: string;
  timeZone: string;
  source: string;
  notice: string;
} {
  const key = cityKeyFor(params.destination);
  if (!key)
    throw new Error(
      "The credit-free demo supports Tokyo, Paris, and New York. Add a Gemini key to plan other cities.",
    );
  const catalog = CATALOGS[key];
  const count = Math.min(3, Math.max(1, params.durationDays || 1));
  const maxStops =
    params.pacing === "relaxed"
      ? 3
      : params.pacing === "fast"
        ? 5
        : key === "newyork"
          ? 5
          : 4;
  const curatedDays = DEMO_DAYS[key]
    .slice(0, count)
    .map((day) => ({ ...day, stops: day.stops.slice(0, maxStops) }));
  const selected = curatedDays.flatMap((day) => day.stops);
  const localDate =
    params.startDate ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: catalog.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const anchor = new Date(`${localDate}T12:00:00Z`);
  const days = Array.from({ length: count }, (_, index) => {
    const dayDate = new Date(anchor);
    dayDate.setUTCDate(dayDate.getUTCDate() + index);
    return {
      dayNumber: index + 1,
      title: curatedDays[index].title,
      date: dayDate.toISOString().slice(0, 10),
      stops: curatedDays[index].stops.map((stop) => ({
        ...stop,
        id: `${stop.id}-d${index + 1}`,
      })),
    };
  });
  const remaining = catalog.places.filter(
    (place) => !selected.some((stop) => stop.id === place.id),
  );
  const trendyHotspots = remaining.map((p) => ({
    id: `discover-${p.id}`,
    name: p.title,
    coordinates: p.coordinates,
    category: p.category,
    categoryLabel: p.categoryLabel,
    address: p.address,
    durationMinutes: p.durationMinutes,
    ticketRequired: p.ticketRequired,
    ticketCost: p.ticketCost,
    estimatedCost: p.estimatedCost,
    bookingUrl: p.bookingUrl,
    secrecyScore: 0,
    touristTrapScore: 0,
    discoveredBy: "Editorial sample selection",
    story: p.description,
    badge: "Worth a detour",
    insiderTip: p.insiderSecret,
    sourceUrl: p.sourceUrl,
    neighborhood: p.neighborhood,
  }));
  const summary =
    key === "newyork"
      ? catalog.summary.replace(
          "Three thoughtful days",
          count === 1
            ? "A thoughtful day"
            : count === 2
              ? "Two thoughtful days"
              : "Three thoughtful days",
        )
      : catalog.summary;
  return {
    city: catalog.city,
    center: catalog.center,
    zoom: 13,
    summary,
    vibe: params.vibe || "Coffee, culture & small discoveries",
    days,
    trendyHotspots,
    timezone: catalog.timezone,
    timeZone: catalog.timezone,
    source: "demo",
    notice:
      "Editorial demo itinerary. Suggested stop times are not verified opening hours. Travel time, prices, and availability must be checked with the linked venues. Discovery picks are not a live popularity feed.",
  };
}

export function formatMinutes(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function parseMinutes(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  const mins = Number(m[2]);
  const suffix = m[3]?.toUpperCase();
  if (mins > 59 || (suffix ? h < 1 || h > 12 : h > 23)) return undefined;
  if (suffix === "AM" && h === 12) h = 0;
  if (suffix === "PM" && h < 12) h += 12;
  return h * 60 + mins;
}
