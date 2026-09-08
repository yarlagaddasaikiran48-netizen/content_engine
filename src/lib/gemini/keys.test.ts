import { describe, expect, it } from "vitest";

import { keyFingerprint, keyLabel, usableKeys } from "@/lib/gemini/keys";

describe("keyFingerprint", () => {
  it("is stable for the same key", () => {
    expect(keyFingerprint("AIza-example")).toBe(keyFingerprint("AIza-example"));
  });

  it("ignores surrounding whitespace, so a pasted key matches its own lock", () => {
    expect(keyFingerprint("  AIza-example \n")).toBe(keyFingerprint("AIza-example"));
  });

  it("separates different keys", () => {
    expect(keyFingerprint("AIza-one")).not.toBe(keyFingerprint("AIza-two"));
  });

  it("never contains the key", () => {
    const key = "AIzaSyEXAMPLE-secret-value";
    const print = keyFingerprint(key);
    expect(print).toHaveLength(8);
    expect(key).not.toContain(print);
  });
});

describe("keyLabel", () => {
  it("counts from one, the way the Settings fields are numbered", () => {
    expect(keyLabel("AIza-one", 0)).toBe(`key 1 (${keyFingerprint("AIza-one")})`);
    expect(keyLabel("AIza-two", 1)).toBe(`key 2 (${keyFingerprint("AIza-two")})`);
  });

  it("does not leak the key", () => {
    expect(keyLabel("AIzaSyEXAMPLE-secret-value", 0)).not.toContain("secret-value");
  });
});

describe("usableKeys", () => {
  it("keeps order, which is the order Settings lists them", () => {
    expect(usableKeys(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("drops the empty second and third fields", () => {
    expect(usableKeys(["a", "", "   ", null, undefined])).toEqual(["a"]);
  });

  it("trims, because a pasted key carries whitespace", () => {
    expect(usableKeys([" a \n"])).toEqual(["a"]);
  });

  it("drops a key pasted twice, so one spent project cannot look like two", () => {
    expect(usableKeys(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("treats a whitespace-different paste of the same key as the same key", () => {
    expect(usableKeys(["a", " a"])).toEqual(["a"]);
  });

  it("returns nothing when no key is set", () => {
    expect(usableKeys([null, undefined, ""])).toEqual([]);
  });
});
