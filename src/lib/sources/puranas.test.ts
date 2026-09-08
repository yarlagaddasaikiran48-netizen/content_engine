import { describe, expect, it } from "vitest";

import { MAHA_PURANAS } from "@/lib/sources/mahapuranas";
import { assertUniqueKeys, CORPUS } from "@/lib/sources/puranas";

/**
 * The rotation hands out one Purana per day and skips any with nothing unused
 * left. A book with two entries is therefore a book the engine sees twice and
 * then never again, which is how the corpus quietly stopped feeding the
 * rotation and the scripts started coming from the general ledger instead.
 */
const MINIMUM_PER_PURANA = 10;

describe("CORPUS", () => {
  it("has no duplicate keys", () => {
    expect(() => assertUniqueKeys()).not.toThrow();
  });

  it("has no duplicate titles", () => {
    // Two entries with the same title are two entries the model will write the
    // same script from, and the second is rejected by the similarity gate after
    // it has already cost a generation.
    const seen = new Map<string, string>();
    for (const entry of CORPUS) {
      const previous = seen.get(entry.title);
      expect(previous, `"${entry.title}" is used by both ${previous} and ${entry.key}`).toBe(
        undefined,
      );
      seen.set(entry.title, entry.key);
    }
  });

  it("gives every entry a checkable reference and citation", () => {
    for (const entry of CORPUS) {
      expect(entry.reference.trim().length, `${entry.key} has no reference`).toBeGreaterThan(0);
      expect(entry.citationUrl, `${entry.key} has no citation`).toMatch(/^https:\/\//);
      expect(entry.summary.trim().length, `${entry.key} has no summary`).toBeGreaterThan(80);
    }
  });

  it("keeps every Maha Purana deep enough for the rotation", () => {
    const counts = new Map<string, number>();
    for (const entry of CORPUS) {
      counts.set(entry.scripture, (counts.get(entry.scripture) ?? 0) + 1);
    }

    for (const purana of MAHA_PURANAS) {
      const count = counts.get(purana.name) ?? 0;
      expect(
        count,
        `${purana.name} has ${count} episodes; the rotation exhausts it and skips the book`,
      ).toBeGreaterThanOrEqual(MINIMUM_PER_PURANA);
    }
  });

  it("names each entry's scripture exactly as the rotation looks it up", () => {
    // claim_unused_topic_for_scripture matches on this string. A near miss —
    // "Shrimad Bhagavata" for "Bhagavata Purana" — silently makes the entry
    // unreachable by rotation rather than failing anywhere visible.
    const known = new Set(MAHA_PURANAS.map((p) => p.name));
    for (const entry of CORPUS) {
      if (!entry.key.startsWith("purana:")) continue;
      if (entry.scripture === "Devi Bhagavata Purana") continue; // not one of the eighteen
      expect(known.has(entry.scripture), `${entry.key} names "${entry.scripture}"`).toBe(true);
    }
  });
});
