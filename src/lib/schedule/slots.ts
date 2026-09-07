/**
 * Slot arithmetic for the publish queue.
 *
 * The schedule is *derived*, never stored. Storing a publish time against each
 * approved script means every reorder, every change of posting times, and every
 * skipped day leaves stale timestamps that have to be repaired. Computing it on
 * read cannot go stale.
 */

/** "HH:MM" in the configured zone. */
export type Slot = string;

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * What time is it, right now, in the operator's timezone?
 *
 * Intl is used rather than a date library because it is built in, correct
 * about DST, and this is the only place the project needs zone conversion.
 */
export function zonedParts(at: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  minutes: number;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    minutes: hour * 60 + Number(parts.minute),
  };
}

/** Minutes past midnight for a "HH:MM" slot. Throws on anything else. */
export function slotMinutes(slot: Slot): number {
  const match = HH_MM.exec(slot);
  if (!match) throw new Error(`"${slot}" is not a HH:MM time.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Slots sorted through the day, deduplicated. Order in Settings is irrelevant. */
export function orderedSlots(slots: Slot[]): Slot[] {
  return [...new Set(slots.filter((s) => HH_MM.test(s)))].sort(
    (a, b) => slotMinutes(a) - slotMinutes(b),
  );
}

/**
 * The slot that is currently due, if any.
 *
 * A slot stays claimable for `windowMinutes` after its time so a tick that is
 * late — a cold start, a retry, a paused project — still publishes rather than
 * skipping the day in silence. It deliberately never reaches back further than
 * that: a slot missed by hours should be skipped, not posted at breakfast.
 */
export function dueSlot(
  now: Date,
  slots: Slot[],
  timeZone: string,
  windowMinutes = 55,
): Slot | null {
  const { minutes } = zonedParts(now, timeZone);

  for (const slot of [...orderedSlots(slots)].reverse()) {
    const start = slotMinutes(slot);
    if (minutes >= start && minutes < start + windowMinutes) return slot;
  }
  return null;
}

/** "2026-09-07" in the operator's timezone — the key for "already posted today". */
export function zonedDateKey(at: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Project when each queued script will go out.
 *
 * Position 0 takes the next slot still ahead today, then the queue rolls into
 * following days. This is what lets the operator swipe a week's worth in one
 * sitting and still see exactly when each one lands.
 */
export function projectSchedule(
  count: number,
  now: Date,
  slots: Slot[],
  timeZone: string,
): Array<{ slot: Slot; dayOffset: number; label: string }> {
  const ordered = orderedSlots(slots);
  if (ordered.length === 0 || count <= 0) return [];

  const { minutes } = zonedParts(now, timeZone);

  // Today's remaining slots first, then whole days after that.
  const remainingToday = ordered.filter((slot) => slotMinutes(slot) > minutes);

  const out: Array<{ slot: Slot; dayOffset: number; label: string }> = [];
  for (let i = 0; i < count; i += 1) {
    let slot: Slot;
    let dayOffset: number;

    if (i < remainingToday.length) {
      slot = remainingToday[i];
      dayOffset = 0;
    } else {
      const after = i - remainingToday.length;
      slot = ordered[after % ordered.length];
      dayOffset = Math.floor(after / ordered.length) + 1;
    }

    out.push({ slot, dayOffset, label: describe(slot, dayOffset) });
  }
  return out;
}

function describe(slot: Slot, dayOffset: number): string {
  const pretty = prettyTime(slot);
  if (dayOffset === 0) return `Today ${pretty}`;
  if (dayOffset === 1) return `Tomorrow ${pretty}`;
  return `In ${dayOffset} days, ${pretty}`;
}

/** 00:00 -> "12:00 AM", 16:30 -> "4:30 PM". */
export function prettyTime(slot: Slot): string {
  const total = slotMinutes(slot);
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
