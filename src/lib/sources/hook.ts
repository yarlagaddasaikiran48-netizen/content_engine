/**
 * The "why today" angle.
 *
 * Combines the computed panchang (always available, always real) with filtered
 * Google Trends (often empty). The result is one short paragraph the prompt
 * uses to make a two-thousand-year-old verse land on a specific afternoon.
 *
 * Priority: a named festival beats a recurring observance, which beats a
 * seasonal note. Trends only ever decorate — they never choose the scripture.
 */

import { computePanchang } from "@/lib/sources/panchang";
import { fetchRelevantTrends } from "@/lib/sources/trending";
import type { HookContext } from "@/lib/types";

/** Gregorian-season fallback so there is always *something* concrete to say. */
function seasonalNote(month: number): string {
  if (month === 0 || month === 1) return "the cool, clear weeks after the winter solstice, a traditional season for discipline and study";
  if (month === 2 || month === 3) return "the turn into the Indian new year, when beginnings are on people's minds";
  if (month === 4 || month === 5) return "the deep heat before the monsoon, when patience is genuinely hard";
  if (month === 6 || month === 7) return "the monsoon months of Shravan, the most devotional weeks of the year";
  if (month === 8 || month === 9) return "the festival season, when homes are being cleaned and lamps prepared";
  return "the shortening days at the year's end, when people take stock of what they did with it";
}

export async function buildHookContext(now: Date = new Date()): Promise<HookContext> {
  const panchang = computePanchang(now);
  const trends = await fetchRelevantTrends(3);

  // The first observance is the most specific: FESTIVAL_RULES entries are
  // pushed before the monthly recurring ones.
  const festival = panchang.observances[0] ?? null;

  const parts: string[] = [`Today is ${panchang.label}.`];

  if (panchang.observances.length > 0) {
    parts.push(`Occasion: ${panchang.observances.join("; ")}.`);
  } else {
    parts.push(`No special observance today — this is ${seasonalNote(now.getUTCMonth())}.`);
  }

  if (trends.relevant.length > 0) {
    parts.push(
      `People in India are searching for: ${trends.relevant.join(", ")}. ` +
        `Reference this only if it fits the verse honestly.`,
    );
  }

  return {
    summary: parts.join(" "),
    occasion: panchang.label,
    trends: trends.relevant,
    festival,
  };
}
