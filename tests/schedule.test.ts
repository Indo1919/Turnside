import { test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryStop } from "../src/types";
import {
  hasFixedReservation,
  insertDiscoveryStop,
} from "../src/services/scheduleService";

function stop(
  id: string,
  time: string,
  durationMinutes = 60,
  status: ItineraryStop["status"] = "upcoming",
): ItineraryStop {
  return {
    id,
    title: id,
    time,
    durationMinutes,
    status,
    category: "cafe",
    categoryLabel: "Coffee",
    coordinates: [-74, 40.7],
    address: "New York",
    description: "Venue",
    insiderSecret: "Check venue hours",
    localSecretScore: 0,
    touristTrapRisk: 0,
    ticketRequired: false,
  };
}
function confirmed(id: string, time: string, duration = 60): ItineraryStop {
  return {
    ...stop(id, time, duration),
    bookingSlot: time,
    bookingPass: {
      status: "confirmed",
      reservationCode: "REAL-123",
      guestName: "Traveler",
      partySize: 2,
      venue: id,
      timeSlot: time,
      bookingUrl: "https://example.com/reservation",
      notes: "Provider terms",
      bookedAt: "2026-10-10T00:00:00Z",
    },
  };
}
function mustSucceed(result: ReturnType<typeof insertDiscoveryStop>) {
  if (!result.ok) assert.fail(result.message);
  return result;
}

test("A current-stop detour uses available space while preserving completed, skipped and confirmed data", () => {
  const completed = stop("visited", "09:00 AM", 30, "completed");
  const current = stop("coffee", "10:00 AM", 60, "current");
  const skipped = stop("skipped", "11:15 AM", 90, "skipped");
  const reservation = confirmed("lunch", "12:30 PM", 90);
  const original = [
    completed,
    current,
    skipped,
    reservation,
    stop("gallery", "03:00 PM"),
  ];
  const snapshot = JSON.stringify(original);
  const result = mustSucceed(
    insertDiscoveryStop(original, stop("detour", "12:30 PM", 45)),
  );
  assert.deepEqual(
    result.stops.map((s) => s.id),
    ["visited", "coffee", "detour", "skipped", "lunch", "gallery"],
  );
  assert.equal(result.added.time, "11:15 AM");
  assert.equal(result.stops[0], completed);
  assert.equal(result.stops[1], current);
  assert.equal(result.stops[3], skipped);
  assert.equal(result.stops[4], reservation);
  assert.deepEqual(result.shiftedStopIds, []);
  assert.equal(JSON.stringify(original), snapshot);
});

test("A detour reflows only upcoming flexible stops before a fixed reservation", () => {
  const current = stop("current", "10:00 AM", 30, "current");
  const flexible = stop("browse", "10:45 AM", 30);
  const reservation = confirmed("lunch", "01:00 PM");
  const result = mustSucceed(
    insertDiscoveryStop(
      [current, flexible, reservation],
      stop("detour", "10:45 AM", 45),
    ),
  );
  assert.equal(result.stops[2].time, "11:45 AM");
  assert.deepEqual(result.shiftedStopIds, ["browse"]);
  assert.equal(result.stops[3], reservation);
  assert.equal(result.stops[3].bookingSlot, "01:00 PM");
  assert.equal(result.stops[3].bookingPass?.timeSlot, "01:00 PM");
});

test("A fixed-booking collision is rejected atomically, with the original pass untouched", () => {
  const current = stop("current", "10:00 AM", 60, "current");
  const flexible = stop("browse", "11:15 AM", 45);
  const reservation = confirmed("lunch", "12:30 PM", 90);
  const original = [current, flexible, reservation];
  const snapshot = JSON.stringify(original);
  const result = insertDiscoveryStop(original, stop("detour", "11:15 AM", 45));
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected a collision");
  assert.equal(result.reason, "fixed-collision");
  assert.equal(result.conflictStopId, "lunch");
  assert.match(result.message, /reservation.*lunch.*12:30 PM/);
  assert.equal(JSON.stringify(original), snapshot);
});

test("Completed and current anchors later in the full day are never moved", () => {
  for (const status of ["completed", "current"] as const) {
    const later = stop("fixed-history", "11:15 AM", 30, status);
    const day = [stop("anchor", "10:00 AM", 60, "current"), later];
    const result = insertDiscoveryStop(day, stop("detour", "11:15 AM", 45), {
      afterStopId: "anchor",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "fixed-collision");
    assert.equal(day[1], later);
    assert.equal(later.time, "11:15 AM");
  }
});

test("Without a current stop, a new place appends after the latest scheduled end and keeps skipped entries", () => {
  const later = stop("late", "04:00 PM", 60, "completed");
  const early = stop("early", "02:00 PM", 30);
  const skipped = stop("skipped", "11:00 PM", 120, "skipped");
  const result = mustSucceed(
    insertDiscoveryStop(
      [later, early, skipped],
      stop("detour", "09:00 AM", 45),
    ),
  );
  assert.deepEqual(result.stops.slice(0, 3), [later, early, skipped]);
  assert.equal(result.added.time, "05:15 PM");
  assert.equal(result.stops[3], result.added);
  assert.deepEqual(result.shiftedStopIds, []);
});

test("An explicit anchor can insert into an upcoming day's gap", () => {
  const result = mustSucceed(
    insertDiscoveryStop(
      [stop("anchor", "09:00 AM", 30), stop("later", "11:00 AM")],
      stop("detour", "08:00 AM", 45),
      { afterStopId: "anchor" },
    ),
  );
  assert.equal(result.added.time, "09:45 AM");
  assert.equal(result.stops[2].time, "11:00 AM");
});

test("Midnight overflow for either a new detour or a moved existing stop is rejected", () => {
  const late = insertDiscoveryStop(
    [stop("late", "11:00 PM", 45)],
    stop("detour", "09:00 AM", 45),
  );
  assert.equal(late.ok, false);
  if (!late.ok) assert.equal(late.reason, "day-full");
  const original = [
    stop("current", "10:00 PM", 30, "current"),
    stop("last", "11:00 PM", 45),
  ];
  const snapshot = JSON.stringify(original);
  const moved = insertDiscoveryStop(original, stop("detour", "11:00 PM", 60));
  assert.equal(moved.ok, false);
  if (!moved.ok) assert.equal(moved.reason, "day-full");
  assert.equal(JSON.stringify(original), snapshot);
});

test("A visit may finish at midnight without wrapping its start time", () => {
  const result = mustSucceed(
    insertDiscoveryStop([], stop("late", "11:15 PM", 45)),
  );
  assert.equal(result.added.time, "11:15 PM");
});

test("Invalid times/durations/anchors and duplicate IDs fail without erasing the day", () => {
  const valid = [stop("valid", "09:00 AM")];
  const cases = [
    insertDiscoveryStop([stop("bad", "25:00")], stop("detour", "09:00 AM")),
    insertDiscoveryStop(valid, stop("detour", "09:00 AM", 0)),
    insertDiscoveryStop(valid, stop("detour", "09:00 AM"), {
      afterStopId: "missing",
    }),
    insertDiscoveryStop(valid, stop("valid", "09:00 AM")),
    insertDiscoveryStop([], stop("detour", "13:00 PM")),
    insertDiscoveryStop(valid, stop("detour", "09:00 AM"), {
      bufferMinutes: -1,
    }),
  ];
  for (const result of cases) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid-schedule");
  }
  assert.deepEqual(
    valid.map((s) => s.id),
    ["valid"],
  );
});

test("Legacy reservation references remain fixed, while an unconfirmed handoff can follow a flexible time change", () => {
  const legacy = confirmed("legacy", "12:30 PM");
  delete legacy.bookingPass!.status;
  assert.equal(hasFixedReservation(legacy), true);
  const handoff = {
    ...stop("handoff", "10:45 AM", 30),
    bookingSlot: "10:45 AM",
    bookingPass: {
      ...legacy.bookingPass!,
      status: "handoff" as const,
      reservationCode: "NOT BOOKED",
      timeSlot: "10:45 AM",
    },
  };
  assert.equal(hasFixedReservation(handoff), false);
  const result = mustSucceed(
    insertDiscoveryStop(
      [stop("current", "10:00 AM", 30, "current"), handoff, legacy],
      stop("detour", "10:45 AM", 45),
    ),
  );
  const moved = result.stops.find((s) => s.id === "handoff")!;
  assert.equal(moved.time, "11:45 AM");
  assert.equal(moved.bookingSlot, "11:45 AM");
  assert.equal(moved.bookingPass?.timeSlot, "11:45 AM");
  assert.equal(moved.bookingPass?.status, "handoff");
  assert.equal(
    result.stops.find((s) => s.id === "legacy"),
    legacy,
  );
  assert.equal(handoff.time, "10:45 AM");
});
