import { describe, expect, it } from "vitest";
import { SETTING_DEFS, settingDef } from "@/lib/settings/catalogue";

describe("SETTING_DEFS", () => {
  it("has unique keys", () => {
    const keys = SETTING_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses snake_case keys so they read the same in SQL and the UI", () => {
    for (const def of SETTING_DEFS) {
      expect(def.key, `${def.key} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("gives every setting a non-empty label", () => {
    for (const def of SETTING_DEFS) {
      expect(def.label.trim().length, `${def.key} has no label`).toBeGreaterThan(0);
    }
  });

  it("keeps cron_secret unencrypted because pg_cron reads it from SQL", () => {
    expect(settingDef("cron_secret").secret).toBe(false);
  });

  it("marks every credential as secret", () => {
    for (const key of [
      "gemini_api_key",
      "youtube_client_id",
      "youtube_client_secret",
      "youtube_refresh_token",
      "github_dispatch_token",
    ]) {
      expect(settingDef(key).secret, `${key} must be secret`).toBe(true);
    }
  });

  it("gives every select a fallback drawn from its own options", () => {
    for (const def of SETTING_DEFS) {
      if (def.kind === "select") {
        expect(def.options, `${def.key} is a select with no options`).toBeDefined();
        expect(def.options).toContain(def.fallback);
      }
    }
  });

  it("bounds target_seconds to the range the spec allows", () => {
    const def = settingDef("target_seconds");
    expect(def.min).toBe(20);
    expect(def.max).toBe(90);
    expect(def.fallback).toBe("60");
  });

  it("defaults posting_times to the two slots the operator chose", () => {
    expect(JSON.parse(settingDef("posting_times").fallback)).toEqual(["00:00", "04:00"]);
  });

  it("gives every numeric setting a fallback inside its own bounds", () => {
    for (const def of SETTING_DEFS) {
      if (def.kind !== "number") continue;
      const fallback = Number(def.fallback);
      expect(Number.isFinite(fallback), `${def.key} fallback is not a number`).toBe(true);
      if (def.min !== undefined) expect(fallback, `${def.key} below min`).toBeGreaterThanOrEqual(def.min);
      if (def.max !== undefined) expect(fallback, `${def.key} above max`).toBeLessThanOrEqual(def.max);
    }
  });

  /**
   * A wrong model id does not fail loudly here. The speech call returns a
   * perfectly good response with no audio in it, the narration falls through
   * to Edge, and the only symptom is that the voice sounds like a machine —
   * which is a thing you notice days later, on a published video.
   *
   * Two ids were wrong at once. "gemini-3.1-flash-tts-preview" is a real
   * model, but it answers on the newer interactions endpoint rather than
   * generateContent, which is what this engine calls. "gemini-2.5-flash-tts-preview"
   * is not a model at all: Google puts the modality last, so it is
   * gemini-2.5-flash-preview-tts.
   */
  it("names voice models that answer on generateContent, with the modality last", () => {
    const chain = [
      settingDef("gemini_tts_model").fallback,
      ...settingDef("gemini_tts_model_fallbacks").fallback.split(","),
    ].map((m) => m.trim()).filter(Boolean);

    expect(chain.length).toBeGreaterThan(0);
    for (const model of chain) {
      expect(model, `${model} puts the modality before "preview"`).toMatch(/-preview-tts$/);
      expect(model, `${model} only answers on the interactions endpoint`).not.toBe(
        "gemini-3.1-flash-tts-preview",
      );
    }
  });

  it("throws a helpful error for an unknown key", () => {
    expect(() => settingDef("nope")).toThrow(/unknown setting/i);
  });
});
