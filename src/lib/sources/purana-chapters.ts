/**
 * Turning a fetched chapter into a ledger row.
 *
 * Separated from wisdomlib.ts so the shape of a topic is decided in one place
 * and can be tested without touching the network.
 *
 * On weight: fetched chapters sit deliberately below the curated entries in
 * puranas.ts. The pool is ordered by `times_used`, then `weight` descending, so
 * a lower number here means the famous episodes — Gajendra, Prahlada, Bali's
 * three paces — are handed out first, and the long tail of every remaining
 * canto follows once they are spent. That is what lets the channel be both
 * "the best stories" and "years of them" rather than choosing.
 */

import type { MahaPurana } from "@/lib/sources/mahapuranas";
import { splitReference, type ChapterLink } from "@/lib/sources/wisdomlib";

/** Below every curated entry in puranas.ts, which run from 95 to 135. */
export const CHAPTER_WEIGHT = 60;

/** Enough for the prompt to say what the passage is about, and no more. */
const SUMMARY_CHARS = 420;

/** A chapter too short to be a chapter — a stub page, or a heading with no body. */
export const MIN_CHAPTER_CHARS = 400;

export interface ChapterRow {
  topic_key: string;
  source: "purana";
  scripture: string;
  reference: string;
  title: string;
  theme: string;
  summary: string;
  sanskrit: null;
  translation: string;
  translator: string | null;
  citation_url: string;
  weight: number;
}

/**
 * A key that survives re-seeding.
 *
 * Built from wisdomlib's own document id rather than the chapter's position or
 * name, both of which move: a book gains a preface, a title is retitled, and
 * every topic after it would be re-inserted as new and handed out again.
 */
export function chapterTopicKey(puranaKey: string, url: string): string {
  const doc = /\/d\/doc(\d+)\.html/.exec(url)?.[1];
  if (!doc) throw new Error(`Not a wisdomlib chapter url: ${url}`);
  return `purana:${puranaKey}:ch${doc}`;
}

/**
 * The opening of the chapter, cut at a sentence.
 *
 * This is a real excerpt rather than a written summary on purpose. A paraphrase
 * would be one more thing standing between the model and the source, and the
 * whole point of reading the text is that it no longer has to be.
 */
export function chapterSummary(text: string, max = SUMMARY_CHARS): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;

  const window = clean.slice(0, max);
  const lastStop = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  // Only cut at a sentence if one ends reasonably late; otherwise a chapter
  // that opens with an abbreviation would be trimmed to a few words.
  if (lastStop > max * 0.5) return window.slice(0, lastStop + 1).trim();
  return `${window.trimEnd()}…`;
}

export function buildChapterRow(
  purana: MahaPurana,
  link: ChapterLink,
  chapter: { text: string; translator: string | null },
): ChapterRow {
  const { reference, title } = splitReference(link.label);

  return {
    topic_key: chapterTopicKey(purana.key, link.url),
    source: "purana",
    scripture: purana.name,
    reference,
    title,
    // The Purana's own subject matter, from the registry. Nothing is inferred
    // about the individual chapter, which would mean guessing.
    theme: purana.themes[0] ?? "the concerns of this Purana",
    summary: chapterSummary(chapter.text),
    sanskrit: null,
    translation: chapter.text,
    translator: chapter.translator,
    // The exact chapter, not the book. A reader can check this in one click.
    citation_url: link.url,
    weight: CHAPTER_WEIGHT,
  };
}

/** Chapters worth storing: long enough to write from. */
export function isUsableChapter(text: string): boolean {
  return text.trim().length >= MIN_CHAPTER_CHARS;
}
