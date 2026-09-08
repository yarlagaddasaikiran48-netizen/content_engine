import { describe, expect, it } from "vitest";

import { buildMasterPrompt } from "@/lib/gemini/master-prompt";

const prompt = buildMasterPrompt(60);

describe("buildMasterPrompt", () => {
  it("interpolates the beat sheet", () => {
    expect(prompt).not.toContain("__BEAT_SHEET__");
    expect(prompt).toContain("THE PHYSICS OF SIXTY SECONDS");
  });

  it("asks for the episode itself, not a bridge to the viewer's week", () => {
    expect(prompt).not.toContain("THE TRANSLATION RULE");
    expect(prompt).not.toMatch(/pressure a young Telugu speaker feels this week/);
    expect(prompt).toContain("THE JOB");
  });

  // These are load-bearing and must survive every style change.
  it("keeps the Telugu register table", () => {
    expect(prompt).toContain("వచ్చెను");
    expect(prompt).toContain("వచ్చాడు");
    expect(prompt).toContain("వ్యావహారిక");
  });

  it("keeps every hard rule", () => {
    expect(prompt).toContain("HARD RULES");
    for (let n = 1; n <= 9; n += 1) {
      expect(prompt).toContain(`${n}. `);
    }
    expect(prompt).toMatch(/Use ONLY the passage supplied/);
    expect(prompt).toMatch(/Never invent Sanskrit/);
  });

  it("keeps both banned-phrase lists", () => {
    expect(prompt).toContain("PHRASES THAT ARE BANNED IN THE NARRATION");
    expect(prompt).toContain("BANNED IN THE ENGLISH TITLE AND DESCRIPTION");
    expect(prompt).toContain("అనగనగా ఒక రోజు");
  });

  it("keeps the four output fields and their languages", () => {
    expect(prompt).toContain("script_body");
    expect(prompt).toContain("seo_description");
    expect(prompt).toContain("hashtags");
    expect(prompt).toMatch(/script_body — \*\*TELUGU/);
  });
});
