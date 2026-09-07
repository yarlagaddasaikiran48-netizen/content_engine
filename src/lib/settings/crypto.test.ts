import { describe, expect, it } from "vitest";
import { decryptSetting, deriveSettingsKey, encryptSetting } from "@/lib/settings/crypto";

const KEY = deriveSettingsKey("service-role-key-abc123");

describe("deriveSettingsKey", () => {
  it("returns 32 bytes", () => {
    expect(KEY.length).toBe(32);
  });

  it("is deterministic for the same input", () => {
    expect(deriveSettingsKey("service-role-key-abc123").equals(KEY)).toBe(true);
  });

  it("differs when the service key differs", () => {
    expect(deriveSettingsKey("a-different-key").equals(KEY)).toBe(false);
  });

  it("prefers an explicit override when supplied", () => {
    const overridden = deriveSettingsKey("service-role-key-abc123", "explicit-master-key");
    expect(overridden.equals(KEY)).toBe(false);
  });

  it("refuses to derive from nothing", () => {
    expect(() => deriveSettingsKey("")).toThrow(/empty/i);
  });
});

describe("encryptSetting / decryptSetting", () => {
  it("round-trips a value", () => {
    const payload = encryptSetting("AIzaSyExampleGeminiKey", KEY);
    expect(decryptSetting(payload, KEY)).toBe("AIzaSyExampleGeminiKey");
  });

  it("never emits the plaintext", () => {
    const payload = encryptSetting("AIzaSyExampleGeminiKey", KEY);
    expect(payload).not.toContain("AIzaSy");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSetting("same", KEY);
    const b = encryptSetting("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptSetting(a, KEY)).toBe(decryptSetting(b, KEY));
  });

  it("round-trips an empty string", () => {
    expect(decryptSetting(encryptSetting("", KEY), KEY)).toBe("");
  });

  it("round-trips multi-line and unicode values", () => {
    const value = "line one\nline two — ॐ";
    expect(decryptSetting(encryptSetting(value, KEY), KEY)).toBe(value);
  });

  it("rejects a payload that was tampered with", () => {
    const payload = encryptSetting("secret", KEY);
    const bytes = Buffer.from(payload, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => decryptSetting(bytes.toString("base64"), KEY)).toThrow();
  });

  it("rejects decryption under the wrong key", () => {
    const payload = encryptSetting("secret", KEY);
    expect(() => decryptSetting(payload, deriveSettingsKey("wrong"))).toThrow();
  });

  it("rejects a payload too short to contain iv and tag", () => {
    expect(() => decryptSetting(Buffer.from("short").toString("base64"), KEY)).toThrow(
      /malformed/i,
    );
  });
});
