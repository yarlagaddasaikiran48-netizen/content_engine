import { describe, expect, it } from "vitest";
import { isPredominantlyTelugu, teluguShare } from "@/lib/safety/language";

const TELUGU = "మళ్ళీ అతని ప్రొఫైల్ చూస్తావు. ఇంకా రిప్లై చేయలేదు.";

describe("teluguShare", () => {
  it("scores Telugu script at one and English at zero", () => {
    expect(teluguShare(TELUGU)).toBeGreaterThan(0.95);
    expect(teluguShare("You check his profile again. He still hasn't replied.")).toBe(0);
  });

  it("ignores punctuation, digits and whitespace", () => {
    expect(teluguShare("ఒక ఏనుగు ఉండేది — 1000, నిజంగా!")).toBeGreaterThan(0.95);
  });

  it("returns zero when there are no letters at all", () => {
    expect(teluguShare("")).toBe(0);
    expect(teluguShare("... 123 !!!")).toBe(0);
  });
});

describe("isPredominantlyTelugu", () => {
  it("accepts Telugu carrying a few English loanwords in Latin letters", () => {
    // Undesirable but not fatal; the prompt asks for Telugu spelling.
    expect(isPredominantlyTelugu("మళ్ళీ అతని profile చూస్తావు. ఇంకా reply చేయలేదు.")).toBe(true);
  });

  it("rejects a script that reverted to English", () => {
    expect(isPredominantlyTelugu("You did everything right and it still went to someone else.")).toBe(false);
  });

  it("rejects romanised Telugu, which the Telugu voice cannot read", () => {
    // The subtle failure: correct language, wrong script. te-IN would read
    // this as English and produce gibberish.
    expect(isPredominantlyTelugu("Neeku telusa, aa enugu veyyi samvatsaralu poradindi.")).toBe(false);
  });

  it("treats an empty body as not Telugu rather than throwing", () => {
    expect(isPredominantlyTelugu("")).toBe(false);
  });

  it("judges script only, not register — literary Telugu still passes", () => {
    // Documented limit: keeping grandhika out is the prompt's job, not this
    // function's. Both registers use the same alphabet.
    expect(isPredominantlyTelugu("అతడు ఆ మృగమును గూర్చి చింతించుట మానలేకపోయెను.")).toBe(true);
  });
});
