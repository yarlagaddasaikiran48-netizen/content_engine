/**
 * Duplicate detection, layer 2 and a local pre-check for layer 3.
 *
 * The three layers together:
 *   1. topic_ledger  — a verse or story is handed out at most once, ever
 *      (enforced in Postgres by claim_unused_topic / consume_topic).
 *   2. content_hash  — a UNIQUE sha256 over the *normalised* script, so
 *      re-wording punctuation or casing cannot sneak an identical script in.
 *   3. similarity    — pg_trgm `max_script_similarity()` against recent rows,
 *      rejecting anything above the configured threshold.
 *
 * `jaccardSimilarity` here mirrors layer 3 cheaply in-process, which lets a
 * generation attempt fail fast without a round trip.
 */

import { createHash } from "node:crypto";

/**
 * Reduce a script to its semantic skeleton: lowercase, no punctuation, no
 * filler words, collapsed whitespace. Two scripts that differ only in
 * phrasing furniture produce the same hash.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "as",
  "of", "at", "by", "for", "with", "about", "into", "to", "from", "in", "on",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "this", "that", "these", "those", "it", "its", "your", "you", "yours",
  "we", "our", "us", "they", "them", "their", "he", "she", "his", "her",
  "i", "me", "my", "will", "would", "can", "could", "should", "may", "might",
  "do", "does", "did", "done", "have", "has", "had", "not", "no",
]);

export function normaliseForHash(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .join(" ")
    .trim();
}

export function contentHash(scriptBody: string): string {
  return createHash("sha256").update(normaliseForHash(scriptBody), "utf8").digest("hex");
}

/** Word trigrams, the same shape pg_trgm compares. */
function trigrams(text: string): Set<string> {
  const words = normaliseForHash(text).split(" ").filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i < words.length; i += 1) {
    grams.add(words[i]);
    if (i + 1 < words.length) grams.add(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length) grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return grams;
}

/** 0 = nothing in common, 1 = identical. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Highest similarity between `candidate` and any previously seen script. */
export function maxSimilarity(candidate: string, previous: string[]): number {
  let highest = 0;
  for (const item of previous) {
    const score = jaccardSimilarity(candidate, item);
    if (score > highest) highest = score;
    if (highest >= 1) break;
  }
  return highest;
}
