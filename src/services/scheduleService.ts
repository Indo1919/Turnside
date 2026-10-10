import type { ItineraryStop } from "../types";

export interface ScheduleInsertionOptions {
  /** Insert after this stop. Without an explicit anchor, use the current stop,
   * or append after the entire day when no stop is current. */
  afterStopId?: string;
  bufferMinutes?: number;
}

export type ScheduleInsertionResult =
  | {
      ok: true;
      stops: ItineraryStop[];
      added: ItineraryStop;
      shiftedStopIds: string[];
      message: string;
    }
  | {
      ok: false;
      reason: "fixed-collision" | "day-full" | "invalid-schedule";
      message: string;
      conflictStopId?: string;
    };

/** A handoff is not a reservation. Older passes with a real reference are kept
 * fixed even if their status predates the explicit confirmed status. */
export function hasFixedReservation(stop: ItineraryStop): boolean {
  const pass = stop.bookingPass;
  return (
    pass?.status === "confirmed" ||
    Boolean(
      pass &&
      pass.status !== "handoff" &&
      pass.reservationCode?.trim() &&
      pass.reservationCode !== "NOT BOOKED",
    )
  );
}

function parseTime(time: string): number | undefined {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23))
    return undefined;
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function timeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function validDuration(duration: number): boolean {
  return Number.isInteger(duration) && duration > 0 && duration <= 24 * 60;
}

function invalid(message: string): ScheduleInsertionResult {
  return { ok: false, reason: "invalid-schedule", message };
}

/** Pure, atomic insertion: callers must pass the full day, including skipped
 * entries. History and fixed bookings are retained exactly; upcoming flexible
 * stops may move later, within the same day. Nothing changes on failure.
 * added.time is used only for an empty/all-skipped day. */
export function insertDiscoveryStop(
  dayStops: ItineraryStop[],
  added: ItineraryStop,
  options: ScheduleInsertionOptions = {},
): ScheduleInsertionResult {
  const buffer = options.bufferMinutes ?? 15;
  if (!Number.isInteger(buffer) || buffer < 0 || buffer >= 24 * 60)
    return invalid("Choose a valid amount of time between stops.");
  if (!validDuration(added.durationMinutes))
    return invalid(
      `Check the visit length for ${added.title} before adding it.`,
    );
  if (hasFixedReservation(added) || added.status !== "upcoming")
    return invalid(
      "Only an upcoming, flexible place can be added as a detour.",
    );
  if (dayStops.some((stop) => stop.id === added.id))
    return invalid(`${added.title} is already in this day.`);

  const times = new Map<string, number>();
  for (const stop of dayStops) {
    if (stop.status === "skipped") continue;
    const start = parseTime(stop.time);
    if (start === undefined || !validDuration(stop.durationMinutes))
      return invalid(`Check the time and visit length for ${stop.title}.`);
    if (start + stop.durationMinutes > 24 * 60)
      return invalid(
        `${stop.title} extends past midnight. Review its time first.`,
      );
    times.set(stop.id, start);
  }

  let anchorIndex = options.afterStopId
    ? dayStops.findIndex((stop) => stop.id === options.afterStopId)
    : dayStops.findIndex((stop) => stop.status === "current");
  if (options.afterStopId && anchorIndex < 0)
    return invalid(
      "The selected stop is no longer in this day. Select it again.",
    );
  if (anchorIndex >= 0 && dayStops[anchorIndex].status === "skipped")
    return invalid("Select a scheduled stop before adding a detour.");
  // No current stop means append, rather than retroactively rewriting the day.
  if (anchorIndex < 0) anchorIndex = dayStops.length - 1;
  const insertionIndex = anchorIndex + 1;
  const previous = dayStops
    .slice(0, insertionIndex)
    .filter((stop) => stop.status !== "skipped");
  let start = previous.length
    ? Math.max(
        ...previous.map(
          (stop) => times.get(stop.id)! + stop.durationMinutes + buffer,
        ),
      )
    : parseTime(added.time);
  if (start === undefined)
    return invalid(`Choose a valid start time for ${added.title}.`);
  if (start + added.durationMinutes > 24 * 60)
    return {
      ok: false,
      reason: "day-full",
      message:
        "This detour would extend past midnight. Choose another day or remove a flexible stop.",
    };

  const inserted: ItineraryStop = { ...added, time: timeLabel(start) };
  const next = [...dayStops];
  const shiftedStopIds: string[] = [];
  let cursor = start + inserted.durationMinutes + buffer;
  for (let i = insertionIndex; i < next.length; i++) {
    const stop = next[i];
    if (stop.status === "skipped") continue;
    const original = times.get(stop.id)!;
    const fixed =
      stop.status === "completed" ||
      stop.status === "current" ||
      hasFixedReservation(stop);
    if (fixed) {
      if (cursor > original) {
        const reservation = hasFixedReservation(stop);
        return {
          ok: false,
          reason: "fixed-collision",
          conflictStopId: stop.id,
          message: reservation
            ? `There is not enough time for ${added.title} before your reservation at ${stop.title} (${stop.time}). Choose another part of the day or remove a flexible stop.`
            : `There is not enough time for ${added.title} before ${stop.title} (${stop.time}). Completed and current stops keep their times; choose another part of the day.`,
        };
      }
      cursor = original + stop.durationMinutes + buffer;
      continue;
    }
    const candidate = Math.max(cursor, original);
    if (candidate + stop.durationMinutes > 24 * 60)
      return {
        ok: false,
        reason: "day-full",
        conflictStopId: stop.id,
        message: `Adding ${added.title} would push ${stop.title} past midnight. Choose another day or remove a flexible stop.`,
      };
    if (candidate !== original) {
      const time = timeLabel(candidate);
      next[i] = {
        ...stop,
        time,
        ...(stop.bookingSlot ? { bookingSlot: time } : {}),
        ...(stop.bookingPass?.status === "handoff"
          ? { bookingPass: { ...stop.bookingPass, timeSlot: time } }
          : {}),
      };
      shiftedStopIds.push(stop.id);
    }
    cursor = candidate + stop.durationMinutes + buffer;
  }
  next.splice(insertionIndex, 0, inserted);
  return {
    ok: true,
    stops: next,
    added: inserted,
    shiftedStopIds,
    message: `Added ${inserted.title} at ${inserted.time}.${shiftedStopIds.length ? ` Adjusted ${shiftedStopIds.length} flexible ${shiftedStopIds.length === 1 ? "stop" : "stops"}.` : ""}`,
  };
}
