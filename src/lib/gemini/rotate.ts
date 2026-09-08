/**
 * Spend the next key that still has quota.
 *
 * The engine used to hold one Gemini key. When Google refused it the day was
 * over: the tick stood down for an hour, woke, was refused again, and the
 * channel went quiet until midnight Pacific. Holding a second key from another
 * Google account — a different project, and therefore a different budget — is
 * the only way to buy more free requests, and this is the loop that reaches
 * for it.
 *
 * Two rules make the difference between rotation and thrashing:
 *
 *  1. Only a *quota* refusal moves to the next key. A blocked prompt, a
 *     retired model or a malformed response will fail identically on every
 *     key, so trying the rest would spend a good key's budget proving what the
 *     first already established.
 *  2. A refused key is remembered before the next is tried. Without that, the
 *     following tick starts at the same spent key and pays for the same
 *     refusal again.
 */

import { keyLabel } from "@/lib/gemini/keys";
import {
  describeCooldown,
  startQuotaCooldown,
  surveyKeys,
  type QuotaPurpose,
} from "@/lib/pipeline/cooldown";
import { isQuotaError, quotaRetrySeconds } from "@/lib/pipeline/fatal";

export class NoGeminiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoGeminiKeyError";
  }
}

/**
 * Raised when every key held is standing down. Carries RESOURCE_EXHAUSTED in
 * its message on purpose, so the callers that already classify errors —
 * isQuotaError, isFatalGenerationError — keep recognising it without knowing
 * that rotation exists.
 */
export class AllKeysExhaustedError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "AllKeysExhaustedError";
  }
}

export interface RotateOptions {
  /** Lines describing what happened, appended in place. */
  log?: string[];
}

/**
 * Run `attempt` against each key that is not cooling, newest refusal first out
 * of the running.
 *
 * @throws NoGeminiKeyError    when no key is configured at all.
 * @throws AllKeysExhaustedError when every configured key is spent.
 * @throws whatever `attempt` threw, when the failure was not about quota.
 */
export async function withGeminiKey<T>(
  purpose: QuotaPurpose,
  keys: readonly string[],
  attempt: (key: string) => Promise<T>,
  options: RotateOptions = {},
): Promise<T> {
  if (keys.length === 0) {
    throw new NoGeminiKeyError(
      "No Gemini API key is set. Open Settings and add one under Connections.",
    );
  }

  const { free, soonest } = await surveyKeys(purpose, keys);

  if (free.length === 0) {
    throw new AllKeysExhaustedError(
      `RESOURCE_EXHAUSTED: all ${keys.length} Gemini ${keys.length === 1 ? "key is" : "keys are"} out of ${purpose === "tts" ? "voice" : "script"} quota. Next one frees up in ${describeCooldown(soonest)}.`,
      soonest,
    );
  }

  let lastQuotaError: unknown;

  for (const key of free) {
    const label = keyLabel(key, keys.indexOf(key));
    try {
      return await attempt(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Anything that is not a spent quota will fail the same way on the next
      // key. Leave now rather than burn a good key proving it.
      if (!isQuotaError(message)) throw error;

      lastQuotaError = error;
      const wait = quotaRetrySeconds(message);
      await startQuotaCooldown(purpose, key, wait);
      options.log?.push(
        `  gemini: ${label} is out of ${purpose === "tts" ? "voice" : "script"} quota; standing it down for ${describeCooldown(wait)}.`,
      );
    }
  }

  throw lastQuotaError instanceof Error
    ? lastQuotaError
    : new AllKeysExhaustedError(
        `RESOURCE_EXHAUSTED: every Gemini key was refused for ${purpose} quota.`,
        3_600,
      );
}
