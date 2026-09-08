/**
 * Which Gemini keys the engine may spend, and how to name one safely.
 *
 * Google applies free-tier quota **per project, not per API key**, so a second
 * key cut from the same Google account buys nothing. A key from somebody
 * else's account is a different project and genuinely doubles the day's
 * budget. That is the whole reason this file exists: the engine used to hold
 * exactly one key, so the moment it was refused there was nothing left to try
 * and the day was over.
 *
 * Deliberately pure — no Supabase, no network. The cooldown bookkeeping that
 * decides *when* a key is worth trying lives in lib/pipeline/cooldown.ts, and
 * the loop that walks the keys lives in lib/gemini/rotate.ts. Keeping the
 * parsing and naming here means both can be tested without standing anything
 * up.
 */

import { createHash } from "node:crypto";

/**
 * A short, stable, non-reversible name for a key.
 *
 * Used for the cooldown lock name and for log lines. A key must never reach
 * either: the lock rows sit in a table the operator reads from a phone, and
 * the log is echoed back over HTTP by the tick. Eight hex characters is far
 * more than enough to keep three keys apart and far too few to be worth
 * attacking.
 */
export function keyFingerprint(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex").slice(0, 8);
}

/** "key 2 (a1b2c3d4)" — enough to tell the operator which key was refused. */
export function keyLabel(key: string, index: number): string {
  return `key ${index + 1} (${keyFingerprint(key)})`;
}

/**
 * The keys worth trying, in the order they should be tried.
 *
 * Blanks are dropped because the second and third Settings fields are empty
 * until a friend hands over a key, and duplicates are dropped because pasting
 * the same key twice would otherwise make one exhausted project look like two
 * and spend a second refused request proving it.
 */
export function usableKeys(candidates: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const candidate of candidates) {
    const key = candidate?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}
