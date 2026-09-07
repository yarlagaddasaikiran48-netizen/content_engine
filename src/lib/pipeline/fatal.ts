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

  return modelGone;
}
