/**
 * Which generation failures are worth another attempt, and which are not.
 *
 * The pipeline claims a fresh topic and pays for a fresh model call on every
 * attempt, so retrying a failure that cannot possibly succeed costs four
 * topics and four API calls to arrive at the same error. A retired model is
 * the case that motivated this: Google withdrew gemini-2.5-flash and every
 * attempt returned the identical 404 before anything else in the pipeline —
 * validation, similarity, the duration gate — ever ran.
 *
 * Kept separate from generate-video.ts so it can be tested without standing up
 * Supabase, Gemini and Edge TTS.
 */

/** Errors that will return the same answer no matter how many topics we try. */
export function isFatalGenerationError(message: string): boolean {
  // Configuration and credentials: nothing about a different topic helps.
  if (
    message.includes("Missing environment variable") ||
    message.includes("API key") ||
    message.includes("claim_unused_topic failed")
  ) {
    return true;
  }

  // A model that no longer exists, or that this key may not address. Matched
  // on the model-specific wording rather than the bare status code, so a 404
  // from storage or any other call still gets its retries.
  const modelGone =
    /no longer available/i.test(message) ||
    /is not found|not found for API version/i.test(message) ||
    (/NOT_FOUND/.test(message) && /model/i.test(message));

  if (modelGone) return true;

  // An exhausted quota. Fatal for this run, not forever: see isQuotaError.
  return isQuotaError(message);
}

/**
 * Has Gemini refused because the quota is spent?
 *
 * This is the failure that took the engine down. A 429 was classed as
 * transient, so generateScript retried it three times 800ms apart, and the
 * outer loop then tried three more topics — twelve requests in eleven seconds
 * against a free-tier budget of twenty, all of them refused, all of them
 * counted. With the tick firing every five minutes the budget could never
 * recover: the day's allowance was gone within minutes of midnight and the
 * remaining twenty-three hours produced nothing but 429s.
 *
 * Matched on the Gemini-specific wording rather than the bare status code, so
 * a 429 from YouTube or Supabase still gets its retries.
 */
export function isQuotaError(message: string): boolean {
  if (/RESOURCE_EXHAUSTED/.test(message)) return true;
  return /429/.test(message) && /quota|rate limit|generativelanguage/i.test(message);
}

/**
 * "This model is currently experiencing high demand."
 *
 * Distinct from a spent quota, and distinct again from a permanent failure.
 * Nothing is wrong with the key, the prompt or the budget -- that one model is
 * busy this minute. Which makes it the one error class where trying a
 * DIFFERENT model is not just reasonable but likely to work, and where the
 * rotation's usual reasoning ("anything that is not a quota problem will fail
 * the same way on the next target") is simply false.
 *
 * Observed in production as HTTP 503 / UNAVAILABLE on gemini-3.6-flash while
 * the rest of the ladder was untouched.
 */
export function isOverloadedError(message: string): boolean {
  return (
    /UNAVAILABLE/.test(message) ||
    /\b503\b/.test(message) ||
    /experiencing high demand|overloaded|try again later/i.test(message)
  );
}

/**
 * How long to wait before asking Gemini again.
 *
 * Google states a wait in the error — "Please retry in 46.86s" — but that
 * number describes the per-minute window, and it is stated even when the
 * budget that actually ran out is the day's. The outage proved it: the engine
 * was refused continuously for twelve hours, with five-minute gaps between
 * clusters, while every one of those errors claimed the wait was under a
 * minute. Taking it at face value would throttle nothing, because the tick
 * fires less often than that anyway.
 *
 * So the stated delay is a floor to respect, never a wait to trust. An hour
 * is the real default: a spent day then costs 24 refused requests instead of
 * 288, and the engine still restarts itself when the window rolls over,
 * without anyone touching it.
 */
const MIN_QUOTA_WAIT_SECONDS = 3_600;

export function quotaRetrySeconds(message: string): number {
  const spoken = /retry in ([0-9.]+)s/i.exec(message);
  const declared = /"retryDelay"\s*:\s*"([0-9.]+)s"/i.exec(message);
  const raw = spoken?.[1] ?? declared?.[1];
  if (!raw) return MIN_QUOTA_WAIT_SECONDS;

  const seconds = Math.ceil(Number(raw));
  if (!Number.isFinite(seconds)) return MIN_QUOTA_WAIT_SECONDS;
  return Math.max(MIN_QUOTA_WAIT_SECONDS, seconds);
}
