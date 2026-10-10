import type { ItineraryStop, TripPlan } from "../types";

export interface CalendarEventPayload {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  timezone?: string;
}

export function itineraryTimezone(trip: TripPlan): string {
  const specified =
    trip.timeZone || (trip as TripPlan & { timezone?: string }).timezone;
  if (specified) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: specified }).format();
      return specified;
    } catch {
      throw new Error(
        "Choose a valid destination timezone before exporting this itinerary.",
      );
    }
  }
  const city = trip.city.trim().toLowerCase();
  if (/^(?:tokyo)(?:,\s*(?:japan|jp))?$/.test(city)) return "Asia/Tokyo";
  if (/^(?:paris)(?:,\s*(?:france|fr))?$/.test(city)) return "Europe/Paris";
  if (
    /^(?:new york(?: city)?|nyc|manhattan)(?:,\s*(?:united states(?: of america)?|usa|us|ny))?$/.test(
      city,
    )
  )
    return "America/New_York";
  throw new Error(
    "Choose a destination timezone before exporting this itinerary.",
  );
}

function stopTimezone(stop: ItineraryStop): string {
  const [lng, lat] = stop.coordinates;
  if (lng > 138 && lng < 141 && lat > 34 && lat < 37) return "Asia/Tokyo";
  if (lng > 1 && lng < 4 && lat > 47 && lat < 50) return "Europe/Paris";
  if (lng > -75 && lng < -72 && lat > 39 && lat < 42) return "America/New_York";
  throw new Error(
    "Choose a destination timezone before adding this stop to your calendar.",
  );
}

function calendarDate(
  dayDate: string,
  index: number,
  timezone: string,
): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
    const date = new Date(`${dayDate}T12:00:00Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dayDate
    )
      throw new Error("Invalid itinerary date.");
    return dayDate;
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const anchor = new Date(`${today}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + index);
  return anchor.toISOString().slice(0, 10);
}

function wallTimeToUtc(date: string, time: string, timezone: string): Date {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) throw new Error(`Invalid stop time: ${time}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23))
    throw new Error("Invalid stop time.");
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let utc = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(utc))
        .map((part) => [part.type, part.value]),
    );
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    if (observed === target) return new Date(utc);
    utc += target - observed;
  }
  throw new Error(
    "This time falls during a daylight-saving clock change. Choose a different stop time.",
  );
}

export function createEventPayloadFromStop(
  stop: ItineraryStop,
  dayDate = "Today",
  dayIndex = 0,
  timezone = stopTimezone(stop),
): CalendarEventPayload {
  const date = calendarDate(dayDate, dayIndex, timezone);
  const start = wallTimeToUtc(date, stop.time, timezone);
  const duration = Math.max(1, Number(stop.durationMinutes) || 60);
  const end = new Date(start.getTime() + duration * 60000);
  const pass = stop.bookingPass as any;
  const description = [
    stop.description,
    stop.insiderSecret ? `Visit note: ${stop.insiderSecret}` : "",
    pass?.status === "handoff"
      ? "Booking is not confirmed. Complete it directly with the venue."
      : pass?.reservationCode && pass.reservationCode !== "NOT BOOKED"
        ? `Reservation reference: ${pass.reservationCode}`
        : "",
    (stop as any).sourceUrl
      ? `Venue information: ${(stop as any).sourceUrl}`
      : "",
    "Planned with Turnside. This is an itinerary reminder, not an admission ticket.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    title: stop.title,
    description,
    location: stop.address || stop.title,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    timezone,
  };
}

function utcCalendarTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
}
export function getGoogleCalendarWebUrl(event: CalendarEventPayload): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.description,
    location: event.location,
    dates: `${utcCalendarTime(event.startTime)}/${utcCalendarTime(event.endTime)}`,
    ...(event.timezone ? { ctz: event.timezone } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let chunk = "";
  let bytes = 0;
  for (const char of line) {
    const count = encoder.encode(char).length;
    if (bytes + count > 75) {
      result += `${chunk}\r\n`;
      chunk = " ";
      bytes = 1;
    }
    chunk += char;
    bytes += count;
  }
  return result + chunk;
}
function stableId(input: string): string {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function generateIcsCalendar(trip: TripPlan): string {
  const timezone = itineraryTimezone(trip);
  const now = utcCalendarTime(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Turnside//Trip Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`${trip.city} · Turnside`)}`,
    `X-WR-CALDESC:${escapeIcs(trip.summary)}`,
    `X-WR-TIMEZONE:${timezone}`,
  ];
  trip.days.forEach((day, dayIndex) =>
    day.stops
      .filter((stop) => stop.status !== "skipped")
      .forEach((stop) => {
        const event = createEventPayloadFromStop(
          stop,
          day.date,
          dayIndex,
          timezone,
        );
        lines.push(
          "BEGIN:VEVENT",
          `UID:${stableId(`${trip.city}|${day.date}|${stop.id}`)}@turnside.local`,
          `DTSTAMP:${now}`,
          `DTSTART:${utcCalendarTime(event.startTime)}`,
          `DTEND:${utcCalendarTime(event.endTime)}`,
          `SUMMARY:${escapeIcs(event.title)}`,
          `DESCRIPTION:${escapeIcs(event.description)}`,
          `LOCATION:${escapeIcs(event.location)}`,
          "STATUS:TENTATIVE",
          "END:VEVENT",
        );
      }),
  );
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function downloadIcsCalendar(trip: TripPlan): void {
  const blob = new Blob([generateIcsCalendar(trip)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${trip.city.split(",")[0].replace(/[^a-z0-9_-]/gi, "_")}_Turnside.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function pushEventToGoogleCalendar(
  accessToken: string,
  event: CalendarEventPayload,
): Promise<{
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  error?: string;
}> {
  try {
    if (!accessToken.trim())
      return {
        success: false,
        error: "A Google Calendar access token is required.",
      };
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: event.title,
          description: event.description,
          location: event.location,
          start: { dateTime: event.startTime, timeZone: event.timezone },
          end: { dateTime: event.endTime, timeZone: event.timezone },
          status: "tentative",
          reminders: { useDefault: true },
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      return {
        success: false,
        error: data.error?.message || `Calendar returned ${response.status}.`,
      };
    return { success: true, eventId: data.id, htmlLink: data.htmlLink };
  } catch {
    return { success: false, error: "Could not reach Google Calendar." };
  }
}
