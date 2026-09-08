import { describe, expect, it } from "vitest";

import { buildBeatSheet } from "@/lib/gemini/beats";

describe("buildBeatSheet", () => {
  it("names the target length in the heading", () => {
    expect(buildBeatSheet(60)).toContain("THE PHYSICS OF SIXTY SECONDS");
    expect(buildBeatSheet(30)).toContain("THE PHYSICS OF THIRTY SECONDS");
  });

  it("opens on a hook and closes quietly", () => {
    // The fractions scale with the target, so at 60s the hook is 0-4, not 0-2.
    expect(buildBeatSheet(60)).toContain("Second 0-4.");
    expect(buildBeatSheet(30)).toContain("Second 0-2.");
    expect(buildBeatSheet(60)).toMatch(/The hook\./);
    expect(buildBeatSheet(60)).toMatch(/Second 54-60\./);
  });

  it("builds a narrative arc, not a bridge to the viewer's life", () => {
    const sheet = buildBeatSheet(60);
    expect(sheet).toContain("The turn.");
    expect(sheet).toContain("The resolution.");
    // The old landing beat asked the model to make the story "the viewer's
    // Tuesday". Retelling has no such beat, and its absence is the point.
    expect(sheet).not.toMatch(/viewer's Tuesday/i);
    expect(sheet).not.toMatch(/becomes the viewer/i);
  });

  it("adds a second complication only past the threshold", () => {
    expect(buildBeatSheet(30)).not.toContain("A second complication.");
    expect(buildBeatSheet(45)).not.toContain("A second complication.");
    expect(buildBeatSheet(60)).toContain("A second complication.");
  });

  it("covers the whole runtime with no gap between beats", () => {
    const sheet = buildBeatSheet(60);
    const bounds = [...sheet.matchAll(/Second (\d+)-(\d+)\./g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(bounds[0][0]).toBe(0);
    expect(bounds[bounds.length - 1][1]).toBe(60);
    for (let i = 1; i < bounds.length; i += 1) {
      expect(bounds[i][0]).toBe(bounds[i - 1][1]);
    }
  });
});
