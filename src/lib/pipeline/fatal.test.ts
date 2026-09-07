import { describe, expect, it } from "vitest";
import { isFatalGenerationError } from "@/lib/pipeline/fatal";

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

  it("lets genuinely transient failures use the remaining attempts", () => {
    expect(isFatalGenerationError("Gemini generation failed: 429 RESOURCE_EXHAUSTED")).toBe(false);
    expect(isFatalGenerationError("Gemini generation failed: 503 UNAVAILABLE")).toBe(false);
    expect(isFatalGenerationError("Gemini returned an empty response.")).toBe(false);
    expect(isFatalGenerationError("Edge TTS socket error: read ECONNRESET")).toBe(false);
  });

  it("does not mistake a 404 elsewhere in the pipeline for a dead model", () => {
    // A missing audio object must still be retried against another topic.
    expect(isFatalGenerationError("Upload failed: 404 bucket not found")).toBe(false);
  });
});
