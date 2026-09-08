import { describe, expect, it } from "vitest";
import { isFatalGenerationError, isQuotaError, quotaRetrySeconds } from "@/lib/pipeline/fatal";

describe("isFatalGenerationError", () => {
  it("treats a retired model as fatal so the loop stops on attempt 1", () => {
    // The exact shape Google returned when gemini-2.5-flash was withdrawn.
    const message =
      'Gemini generation failed: {"error":{"code":404,"message":"This model ' +
      "models/gemini-2.5-flash is no longer available to new users. Please " +
      'update your code to use models/gemini-3.6-flash","status":"NOT_FOUND"}}';
    expect(isFatalGenerationError(message)).toBe(true);
  });

  it("treats missing configuration as fatal", () => {
    expect(isFatalGenerationError("Missing environment variable GEMINI_API_KEY")).toBe(true);
    expect(isFatalGenerationError("No Gemini API key is set. Open Settings and add it.")).toBe(true);
    expect(isFatalGenerationError("claim_unused_topic failed: permission denied")).toBe(true);
  });

  // Reversed deliberately. This assertion used to expect false, on the reading
  // that a 429 is transient. It is not transient in any sense the retry loop
  // can exploit: the four attempts fire inside eleven seconds, against a quota
  // whose own error says to wait about fifty. Every retry spends one more
  // request from the exhausted budget to be told the same thing again.
  it("treats an exhausted quota as fatal for this run", () => {
    const message =
      'Gemini generation failed: {"error":{"code":429,"message":"You exceeded ' +
      "your current quota. * Quota exceeded for metric: generativelanguage." +
      "googleapis.com/generate_content_free_tier_requests, limit: 20, model: " +
      'gemini-3.6-flash. Please retry in 46.867680111s.","status":"RESOURCE_EXHAUSTED"}}';
    expect(isFatalGenerationError(message)).toBe(true);
    expect(isQuotaError(message)).toBe(true);
  });

  it("lets genuinely transient failures use the remaining attempts", () => {
    expect(isFatalGenerationError("Gemini generation failed: 503 UNAVAILABLE")).toBe(false);
    expect(isFatalGenerationError("Gemini returned an empty response.")).toBe(false);
    expect(isFatalGenerationError("Edge TTS socket error: read ECONNRESET")).toBe(false);
    expect(isQuotaError("Gemini generation failed: 503 UNAVAILABLE")).toBe(false);
  });

  it("does not read a 429 from somewhere else as a Gemini quota", () => {
    // YouTube and Supabase both rate-limit too; those deserve their retries.
    expect(isQuotaError("Upload failed: 429 Too Many Requests")).toBe(false);
  });

  it("does not mistake a 404 elsewhere in the pipeline for a dead model", () => {
    // A missing audio object must still be retried against another topic.
    expect(isFatalGenerationError("Upload failed: 404 bucket not found")).toBe(false);
  });
});

describe("quotaRetrySeconds", () => {
  it("defaults to an hour when the error names no delay", () => {
    expect(quotaRetrySeconds("RESOURCE_EXHAUSTED")).toBe(3_600);
  });

  it("does not trust a stated delay shorter than the hour", () => {
    // The real message from the outage. Google asked for 46.8 seconds while
    // refusing every request for twelve hours straight — the number describes
    // the per-minute window, not the daily budget that had actually run out.
    // Believing it would leave the tick hammering at its own five-minute
    // cadence, which is what caused the outage in the first place.
    expect(quotaRetrySeconds('"Please retry in 46.867680111s."')).toBe(3_600);
    expect(quotaRetrySeconds('{"retryDelay":"58s"}')).toBe(3_600);
  });

  it("respects a stated delay longer than the hour", () => {
    // If Google ever asks for more, it knows something we do not.
    expect(quotaRetrySeconds('{"retryDelay":"7200s"}')).toBe(7_200);
  });
});
