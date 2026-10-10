import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_TRIP } from "../src/demoData";
import {
  createEventPayloadFromStop,
  generateIcsCalendar,
  itineraryTimezone,
} from "../src/services/calendarService";

const london = {
  ...INITIAL_TRIP,
  city: "London, UK",
  center: [-0.13, 51.51] as [number, number],
  timeZone: undefined,
  timezone: undefined,
  days: [
    {
      ...INITIAL_TRIP.days[0],
      date: "2026-10-10",
      stops: [
        {
          ...INITIAL_TRIP.days[0].stops[0],
          coordinates: [-0.13, 51.51] as [number, number],
          time: "11:00 AM",
          durationMinutes: 60,
        },
      ],
    },
  ],
};

test("Unknown destination zones block calendar export instead of assuming UTC", () => {
  assert.throws(
    () => itineraryTimezone(london),
    /Choose a destination timezone/,
  );
  assert.throws(
    () => generateIcsCalendar(london),
    /Choose a destination timezone/,
  );
  assert.throws(
    () => createEventPayloadFromStop(london.days[0].stops[0], "2026-10-10"),
    /Choose a destination timezone/,
  );
});

test("A valid custom destination timezone retains its daylight-saving offset", () => {
  const trip = { ...london, timeZone: "Europe/London" };
  assert.equal(itineraryTimezone(trip), "Europe/London");
  const event = createEventPayloadFromStop(
    trip.days[0].stops[0],
    "2026-10-10",
    0,
    itineraryTimezone(trip),
  );
  assert.equal(event.startTime, "2026-10-10T10:00:00.000Z");
  assert.equal(event.endTime, "2026-10-10T11:00:00.000Z");
  assert.match(generateIcsCalendar(trip), /DTSTART:20261010T100000Z/);
  assert.match(generateIcsCalendar(trip), /X-WR-TIMEZONE:Europe\/London/);
});

test("An invalid explicit timezone fails with actionable guidance", () => {
  assert.throws(
    () => itineraryTimezone({ ...INITIAL_TRIP, timeZone: "Not/A_Timezone" }),
    /Choose a valid destination timezone/,
  );
});

test("Known legacy destinations remain supported without their timezone field", () => {
  const base = { ...INITIAL_TRIP, timeZone: undefined, timezone: undefined };
  assert.equal(
    itineraryTimezone({ ...base, city: "New York, USA" }),
    "America/New_York",
  );
  assert.equal(
    itineraryTimezone({ ...base, city: "New York City" }),
    "America/New_York",
  );
  assert.equal(
    itineraryTimezone({ ...base, city: "Tokyo, Japan" }),
    "Asia/Tokyo",
  );
  assert.equal(
    itineraryTimezone({ ...base, city: "Paris, France" }),
    "Europe/Paris",
  );
  assert.throws(
    () => itineraryTimezone({ ...base, city: "Paris, Texas" }),
    /Choose a destination timezone/,
  );
});

test("Explicit UTC and legacy timezone fields are respected when valid", () => {
  assert.equal(itineraryTimezone({ ...london, timeZone: "UTC" }), "UTC");
  assert.equal(
    itineraryTimezone({ ...london, timezone: "Europe/London" }),
    "Europe/London",
  );
});
