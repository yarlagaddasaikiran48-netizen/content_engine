import { describe, expect, it } from "vitest";

import {
  ImageQuotaError,
  imageFromGeminiResponse,
  isQuotaRefusal,
  paceFor,
  providerFor,
} from "@/lib/images/providers";

describe("providerFor", () => {
  it("returns the named source", () => {
    expect(providerFor("cloudflare").name).toBe("cloudflare");
    expect(providerFor("gemini").name).toBe("gemini");
    expect(providerFor("pollinations").name).toBe("pollinations");
  });

  it("is forgiving about how the name was typed", () => {
    expect(providerFor("  Cloudflare ").name).toBe("cloudflare");
  });

  it("falls back to the one that needs no account", () => {
    // A misconfigured source must not stop a render; it must draw something.
    expect(providerFor("midjourney").name).toBe("pollinations");
    expect(providerFor("").name).toBe("pollinations");
  });
});

describe("paceFor", () => {
  it("prefers the operator's number", () => {
    expect(paceFor(providerFor("gemini"), 5_000)).toBe(5_000);
    expect(paceFor(providerFor("pollinations"), 0)).toBe(0);
  });

  it("falls back to the provider's own pacing when the number is unusable", () => {
    expect(paceFor(providerFor("gemini"), Number.NaN)).toBe(31_000);
    expect(paceFor(providerFor("pollinations"), -1)).toBe(1_500);
  });
});

/**
 * The first version of this loop carried on through all fifteen shots after
 * the first quota refusal, sleeping between each, and spent eight minutes
 * relearning what it knew on the first call. Recognising the refusal is what
 * stops that.
 */
describe("isQuotaRefusal", () => {
  it("recognises the shapes Google and Cloudflare actually return", () => {
    expect(isQuotaRefusal(new Error("RESOURCE_EXHAUSTED: every model is spent"))).toBe(true);
    expect(isQuotaRefusal(new Error('Quota exceeded for metric: ... limit: 0, model: x'))).toBe(true);
    expect(isQuotaRefusal(new Error("Cloudflare returned HTTP 429"))).toBe(true);
    expect(isQuotaRefusal(new ImageQuotaError("no token configured"))).toBe(true);
  });

  it("leaves an ordinary failure alone, so one bad shot does not end the run", () => {
    expect(isQuotaRefusal(new Error("The image model returned no image — only text."))).toBe(false);
    expect(isQuotaRefusal(new Error("socket hang up"))).toBe(false);
    expect(isQuotaRefusal(undefined)).toBe(false);
  });
});

describe("imageFromGeminiResponse", () => {
  it("pulls the first inline image out", () => {
    const png = Buffer.from("hello").toString("base64");
    const out = imageFromGeminiResponse({
      candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { data: png, mimeType: "image/png" } }] } }],
    });
    expect(out.bytes.toString()).toBe("hello");
    expect(out.mimeType).toBe("image/png");
  });

  it("says so when the model answered with words instead of a picture", () => {
    expect(() =>
      imageFromGeminiResponse({ candidates: [{ content: { parts: [{ text: "I cannot" }] } }] }),
    ).toThrow(/no image/i);
  });

  it("does not throw a type error on an empty response", () => {
    expect(() => imageFromGeminiResponse({})).toThrow(/no image/i);
  });
});
