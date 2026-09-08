import { describe, expect, it } from "vitest";

import { keyFingerprint } from "@/lib/gemini/keys";
import { cooldownLockName, describeCooldown } from "@/lib/pipeline/cooldown";

describe("cooldownLockName", () => {
  it("gives each key its own lease, so one spent project cannot stop another", () => {
    expect(cooldownLockName("text", "mine")).not.toBe(cooldownLockName("text", "friend"));
  });

  it("keeps the voice quota separate from the script quota for the same key", () => {
    // This is the one that matters. Gemini meters each model separately, and
    // the TTS preview model runs out far sooner. Sharing a lease would let a
    // spent voice quota stop the engine writing scripts — the expensive thing
    // to lose, and the one with no free fallback underneath it.
    expect(cooldownLockName("tts", "mine")).not.toBe(cooldownLockName("text", "mine"));
  });

  it("is stable, so the lease written this tick is the one read next tick", () => {
    expect(cooldownLockName("text", "mine")).toBe(cooldownLockName("text", "mine"));
  });

  it("never writes the key into a row the operator can read", () => {
    const key = "AIzaSyEXAMPLE-secret-value";
    const name = cooldownLockName("text", key);
    expect(name).not.toContain(key);
    expect(name).toBe(`gemini-quota:text:${keyFingerprint(key)}`);
  });
});

describe("describeCooldown", () => {
  it("reads as a wait, not a number of seconds, once it is a long one", () => {
    expect(describeCooldown(45)).toBe("45 seconds");
    expect(describeCooldown(600)).toBe("10 minutes");
    expect(describeCooldown(7_200)).toBe("2 hours");
  });
});
