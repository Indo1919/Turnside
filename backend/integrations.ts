import type { ItineraryStop, TripPlan } from "../src/types";
import {
  CATALOGS,
  buildDemoTrip,
  cityKeyFor,
  formatMinutes,
  parseMinutes,
} from "./demoData";

export function validCoordinates(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

export function textInput(value: unknown, maxLength = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function hasRealKey(value?: string): boolean {
  return Boolean(
    value?.trim() && !/^(MY_|YOUR_|CHANGE_|placeholder|undefined)/i.test(value),
  );
}

export function demoChat(
  message: string,
  itinerary?: TripPlan,
  activeStop?: ItineraryStop,
): string {
  const stops = itinerary?.days?.flatMap((day) => day.stops) || [];
  const city = itinerary?.city || "Tokyo";
  const catalog = CATALOGS[cityKeyFor(city) || "tokyo"];
  const all = [...stops, ...catalog.places];
  const lower = message.toLowerCase();
  if (/book|ticket|reserv|payment/.test(lower))
    return `I can take you to the venue’s official booking page. Choose “Check availability” on ${activeStop?.title || all.find((s) => s.ticketRequired)?.title || "a place"} to complete the reservation there. No tickets or payments have been booked in this prototype.`;
  if (/late|delay|slow|relax|rush/.test(lower))
    return "Use “Running late” to shift your remaining stops by 30 minutes. Completed stops stay put, and any saved reservation times stay fixed so you can see a conflict before changing plans.";
  if (/rain|weather|indoors|indoor/.test(lower)) {
    const indoor = all.find((s) => s.category === "culture");
    return `For an indoor pause, try ${indoor?.title || "a nearby museum"}. ${indoor?.description || "Check its opening hours first."} The weather card uses Open-Meteo when it is reachable and labels sample weather when it is not.`;
  }
  if (/coffee|cafe|café/.test(lower)) {
    const coffee = all.find((s) => s.category === "cafe");
    return `${coffee?.title || "A neighborhood café"} is a good coffee stop. ${coffee?.description || ""} You can save it or add it to your day from Discover.`;
  }
  if (/walk|route|direction|navigate|how far/.test(lower))
    return `Open directions on ${activeStop?.title || "a stop"} for a walking route in Google Maps. The in-app route uses Mapbox Directions when connected; a dashed preview simply connects your stops and does not claim turn-by-turn directions.`;
  if (/hidden|local|detour|recommend|near|discover/.test(lower)) {
    const saved = new Set(stops.map((s) => s.title));
    const extra =
      catalog.places.find((p) => !saved.has(p.title)) || catalog.places[3];
    return `A good detour is ${extra.title} in ${extra.neighborhood}. ${extra.description} It is an editorial pick, so check the venue page rather than treat it as a measured live trend.`;
  }
  if (/budget|cheap|free|cost/.test(lower)) {
    const park = all.find((s) => s.category === "nature");
    return `Keep the day lighter with ${park?.title || "a public park"} and a self-guided neighborhood walk. Food and admission prices are checked at the venue; this demo does not have a live price feed.`;
  }
  if (/calendar|share|export/.test(lower))
    return "Export your day as an .ics file for Apple Calendar or Outlook, or open a stop in Google Calendar. Share creates a text itinerary that you can send yourself; it does not publish your plans automatically.";
  if (activeStop)
    return `${activeStop.title} is your selected stop. ${activeStop.description} Ask about coffee, an indoor alternative, a detour, or running late to explore the demo.`;
  return `For ${city}, I’d start with ${stops[0]?.title || catalog.places[0].title} and leave room between stops. Ask for coffee, an indoor alternative, or a detour. This is a credit-free guided demo; switch to Live AI for an open-ended conversation when your Gemini key is connected.`;
}

export function replanStops(
  stops: ItineraryStop[],
  delay: number,
): { adjustmentSummary: string; stops: ItineraryStop[]; conflicts: string[] } {
  let moved = 0;
  const conflicts: string[] = [];
  let previousEnd: number | undefined;
  const result = stops.map((stop) => {
    const original = parseMinutes(stop.time);
    if (original === undefined)
      throw new Error(`Invalid time for ${stop.title}.`);
    if (stop.status === "completed" || stop.status === "skipped") {
      previousEnd = original + stop.durationMinutes;
      return { ...stop };
    }
    const pass = stop.bookingPass as any;
    const fixed =
      pass?.status === "confirmed" ||
      (pass &&
        pass.status !== "handoff" &&
        pass.reservationCode !== "NOT BOOKED");
    if (fixed) {
      if (previousEnd !== undefined && previousEnd + 15 > original)
        conflicts.push(
          `${stop.title} has a fixed reservation at ${stop.time}; check arrival time before continuing.`,
        );
      previousEnd = original + stop.durationMinutes;
      return { ...stop };
    }
    const candidate = Math.max(
      original + delay,
      previousEnd === undefined ? 0 : previousEnd + 15,
    );
    if (candidate + stop.durationMinutes > 24 * 60) {
      conflicts.push(
        `${stop.title} would extend past midnight. Review or skip this stop.`,
      );
      return { ...stop };
    }
    moved++;
    previousEnd = candidate + stop.durationMinutes;
    return { ...stop, time: formatMinutes(candidate) };
  });
  return {
    adjustmentSummary: moved
      ? `Shifted ${moved} remaining ${moved === 1 ? "stop" : "stops"} by at least ${delay} minutes and kept completed stops and reservations fixed.${conflicts.length ? " Review the reservation conflict before setting out." : ""}`
      : "No flexible remaining stops to move. Completed stops and fixed reservations stay at their original times.",
    stops: result,
    conflicts,
  };
}

export function bookingHandoff(
  title: string,
  city: string,
  time: string,
  partySize: number,
) {
  const catalog = CATALOGS[cityKeyFor(city) || ""];
  const match = catalog?.places.find(
    (p) =>
      title.toLowerCase().includes(p.title.toLowerCase()) ||
      p.title.toLowerCase().includes(title.toLowerCase()),
  );
  const fallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${city}`)}`;
  return {
    reservationCode: "NOT BOOKED",
    guestName: "Traveler",
    partySize,
    venue: title,
    timeSlot: time,
    status: "handoff",
    providerName: match?.bookingUrl
      ? "Official venue"
      : "Google Maps venue lookup",
    bookingUrl: match?.bookingUrl || fallback,
    notes:
      "Complete your purchase or reservation directly with the provider. Availability, price, and cancellation terms are confirmed there. This app has not made a booking or charged you.",
  };
}

export function haversineDistance(
  a: [number, number],
  b: [number, number],
): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function previewRoute(coordinates: [number, number][]) {
  const distanceMeters = Math.round(
    coordinates
      .slice(1)
      .reduce(
        (total, point, index) =>
          total + haversineDistance(coordinates[index], point),
        0,
      ),
  );
  return {
    coordinates,
    distanceMeters,
    durationMinutes: Math.round(distanceMeters / 75),
    source: "preview",
    notice:
      "Straight-line route preview and rough distance estimate. Open Google Maps for actual walking directions.",
  };
}

export function validateStop(value: any): value is ItineraryStop {
  return (
    value &&
    textInput(value.id, 100) &&
    textInput(value.title, 200) &&
    validCoordinates(value.coordinates) &&
    parseMinutes(value.time) !== undefined &&
    Number.isInteger(value.durationMinutes) &&
    value.durationMinutes > 0 &&
    value.durationMinutes <= 480 &&
    [
      "cafe",
      "culture",
      "dining",
      "niche",
      "nightlife",
      "nature",
      "transit",
    ].includes(value.category) &&
    ["completed", "upcoming", "current", "skipped"].includes(value.status)
  );
}

export async function generateLivePlan(
  params: any,
  generate: (prompt: string, json?: boolean) => Promise<string>,
): Promise<TripPlan & { source: string; notice: string; timezone?: string }> {
  const key = cityKeyFor(params.destination);
  if (key) {
    const catalog = CATALOGS[key];
    const template = buildDemoTrip(params);
    const prompt = `You are Turnside, a practical trip planner. Arrange only the places in the supplied catalog. Do not invent venues, times of opening, availability, reservations, passwords, or special privileges. User request: ${params.prompt || ""}. Vibe: ${params.vibe || ""}. Note: ${params.travelerNote || ""}. Pacing: ${params.pacing}. ${params.durationDays} days. Return JSON {"summary":string,"days":[{"title":string,"stops":[{"placeId":string,"time":"09:00 AM","durationMinutes":number}]}]}. Return exactly ${params.durationDays} days, 2-5 different stops per day; every placeId must be from catalog; no duplicate places. Keep times ascending and allow realistic time between different neighborhoods. Catalog: ${JSON.stringify(catalog.places.map((p) => ({ id: p.id, title: p.title, neighborhood: p.neighborhood, category: p.category, durationMinutes: p.durationMinutes })))}.`;
    const parsed = parseJson(await generate(prompt, true));
    if (
      !Array.isArray(parsed.days) ||
      parsed.days.length !== params.durationDays
    )
      throw new Error("AI response did not contain the requested days.");
    const seen = new Set<string>();
    const days = parsed.days.map((day: any, index: number) => {
      if (
        !Array.isArray(day.stops) ||
        day.stops.length < 1 ||
        day.stops.length > 6
      )
        throw new Error("Invalid stop count.");
      let previousEnd = 0;
      const stops = day.stops.map((selection: any) => {
        const place = catalog.places.find((p) => p.id === selection.placeId);
        const start = parseMinutes(selection.time);
        const duration = selection.durationMinutes;
        if (
          !place ||
          seen.has(place.id) ||
          start === undefined ||
          start < previousEnd ||
          !Number.isInteger(duration) ||
          duration < 15 ||
          duration > 240 ||
          start + duration > 1440
        )
          throw new Error(
            "AI returned an invalid or conflicting place schedule.",
          );
        previousEnd = start + duration;
        seen.add(place.id);
        return {
          ...place,
          id: `${place.id}-d${index + 1}`,
          time: selection.time,
          durationMinutes: duration,
        };
      });
      return {
        ...template.days[index],
        title: textInput(day.title, 180) || template.days[index].title,
        stops,
      };
    });
    return {
      ...template,
      days,
      summary: textInput(parsed.summary, 1200) || template.summary,
      source: "gemini",
      notice:
        "Gemini arranged this itinerary from the editorial place catalog. Opening hours, prices, and availability are checked at the venue.",
    };
  }
  // Open-ended planning is explicitly marked as AI suggestions; it never
  // claims that ungrounded model output is verified venue or booking data.
  const prompt = `You are Turnside, a trip planner. Plan ${params.durationDays} days in ${params.destination}, ${params.pacing} pace. Request: ${params.prompt || params.vibe || ""}. Note: ${params.travelerNote || ""}. Recommend real well-known venues only; never invent booking confirmations, secret passwords, availability, popularity metrics, or local testimonials. All suggestions need traveler verification. Return only JSON: {"city":string,"center":[longitude,latitude],"timezone":IANA timezone string,"summary":string,"vibe":string,"days":[{"dayNumber":number,"title":string,"stops":[{"id":string,"title":string,"time":"09:00 AM","durationMinutes":number,"category":"cafe|culture|dining|niche|nightlife|nature","categoryLabel":string,"coordinates":[longitude,latitude],"address":string,"description":string,"ticketRequired":boolean}]}]}. Exactly ${params.durationDays} days, at most 5 stops each. Coordinates longitude first. Do not add trendy scores.`;
  const parsed = parseJson(await generate(prompt, true));
  if (
    !validCoordinates(parsed.center) ||
    !Array.isArray(parsed.days) ||
    parsed.days.length !== params.durationDays
  )
    throw new Error("AI returned an invalid itinerary.");
  const anchor = new Date(
    `${params.startDate || new Date().toISOString().slice(0, 10)}T12:00:00Z`,
  );
  const days = parsed.days.map((day: any, index: number) => {
    if (
      !Array.isArray(day.stops) ||
      day.stops.length < 1 ||
      day.stops.length > 6
    )
      throw new Error("Invalid AI stops.");
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() + index);
    const stops = day.stops.map((p: any, stopIndex: number) => {
      const stop = {
        ...p,
        id: `ai-${index + 1}-${stopIndex + 1}`,
        title: textInput(p.title, 200),
        status: "upcoming",
        description: textInput(p.description, 1600),
        address: textInput(p.address, 300),
        categoryLabel: textInput(p.categoryLabel, 100),
        insiderSecret:
          "AI suggestion. Verify the venue, hours, and location before visiting.",
        localSecretScore: 0,
        touristTrapRisk: 0,
        estimatedCost: "Check with venue",
        ticketRequired: Boolean(p.ticketRequired),
        sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.title} ${parsed.city || params.destination}`)}`,
        sourceLabel: "AI suggestion — verify location",
      };
      if (!validateStop(stop)) throw new Error("Invalid AI stop details.");
      return stop;
    });
    return {
      dayNumber: index + 1,
      title: textInput(day.title, 180),
      date: date.toISOString().slice(0, 10),
      stops,
    };
  });
  let timezone: string | undefined;
  if (typeof parsed.timezone === "string" && parsed.timezone.trim()) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.timezone }).format();
      timezone = parsed.timezone;
    } catch {
      /* Unknown zones remain absent; calendar export requires a chosen zone. */
    }
  }
  return {
    city: textInput(parsed.city, 180) || params.destination,
    center: parsed.center,
    zoom: 13,
    summary: textInput(parsed.summary, 1200),
    vibe: textInput(parsed.vibe, 200) || params.vibe,
    days,
    trendyHotspots: [],
    ...(timezone ? { timezone, timeZone: timezone } : {}),
    source: "gemini",
    notice:
      "AI-generated suggestions. Venue details and map locations are not independently verified; use the venue lookup links before visiting. No live popularity or booking availability feed is connected.",
  };
}

function parseJson(text: string): any {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, ""),
  );
}
