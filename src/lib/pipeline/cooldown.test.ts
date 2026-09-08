import { describe, expect, it } from "vitest";

import { keyFingerprint } from "@/lib/gemini/keys";
import { cooldownLockName, describeCooldown } from "@/lib/pipeline/cooldown";

const FLASH = "gemini-3.6-flash";
const LITE = "gemini-3.1-flash-lite";

describe("cooldownLockName", () => {
  it("gives each key its own lease, so one spent project cannot stop another", () => {
    expect(cooldownLockName("text", { key: "mine", model: FLASH })).not.toBe(
      cooldownLockName("text", { key: "friend", model: FLASH }),
    );
  });

  it("gives each model its own lease on the same key", () => {
    // The whole quota strategy rests on this. gemini-3.6-flash allows 20
    // requests a day and gemini-3.1-flash-lite allows 500 on that very same
    // key; sharing a lease would throw the 500 away the moment the 20 ran out.
    expect(cooldownLockName("text", { key: "mine", model: FLASH })).not.toBe(
      cooldownLockName("text", { key: "mine", model: LITE }),
    );
  });

  it("keeps the voice quota separate from the script quota", () => {
    // Gemini meters each model separately and the TTS preview model runs out
    // far sooner. Sharing a lease would let a spent voice quota stop the engine
    // writing scripts — the expensive thing to lose, and the one with no free
    // fallback underneath it.
    expect(cooldownLockName("tts", { key: "mine", model: FLASH })).not.toBe(
      cooldownLockName("text", { key: "mine", model: FLASH }),
    );
  });

  it("is stable, so the lease written this tick is the one read next tick", () => {
    expect(cooldownLockName("text", { key: "mine", model: FLASH })).toBe(
      cooldownLockName("text", { key: "mine", model: FLASH }),
    );
  });

  it("names the model in the open and the key only by fingerprint", () => {
    // The operator reads system_lock from a phone to find out what ran out.
    // The model is the useful half of that and is not a secret; the key is.
    const key = "AIzaSyEXAMPLE-secret-value";
    const name = cooldownLockName("text", { key, model: FLASH });

    expect(name).toBe(`gemini-quota:text:${FLASH}:${keyFingerprint(key)}`);
    expect(name).not.toContain(key);
  });
});

describe("describeCooldown", () => {
  it("reads as a wait, not a number of seconds, once it is a long one", () => {
    expect(describeCooldown(45)).toBe("45 seconds");
    expect(describeCooldown(600)).toBe("10 minutes");
    expect(describeCooldown(7_200)).toBe("2 hours");
  });
});
