import { describe, expect, it } from "vitest";

import {
  buildShotListPrompt,
  decorateShot,
  normaliseShots,
  NEGATIVE_ANCHOR,
  STYLE_ANCHOR,
} from "@/lib/images/shots";

const EPISODE = {
  scriptBody: "గజేంద్రుడు సరస్సులో దిగాడు. మొసలి అతని కాలు పట్టుకుంది.",
  deity: "Vishnu",
  scenePrompt: "Vishnu descends on Garuda over a lake as an elephant lifts a lotus",
  scripture: "Bhagavata Purana",
  reference: "Canto 8",
  count: 12,
};

describe("buildShotListPrompt", () => {
  it("asks for exactly the number of shots the renderer needs", () => {
    const prompt = buildShotListPrompt(EPISODE);
    expect(prompt).toContain("12 shots long");
    expect(prompt).toContain("Return exactly 12 prompts.");
  });

  it("carries the narration, so the shots follow this story and not the genre", () => {
    expect(buildShotListPrompt(EPISODE)).toContain("మొసలి అతని కాలు పట్టుకుంది");
  });

  it("names the figure and the passage", () => {
    const prompt = buildShotListPrompt(EPISODE);
    expect(prompt).toContain("Bhagavata Purana Canto 8");
    expect(prompt).toContain("centred on Vishnu");
  });

  it("tells the model not to spend the sentence on style words", () => {
    // The style tail is appended per image; repeating it in every prompt
    // wastes the part of the sentence that should describe the scene.
    expect(buildShotListPrompt(EPISODE)).toMatch(/Do not include style words/);
  });

  it("survives an episode with nothing filled in but the narration", () => {
    const prompt = buildShotListPrompt({
      scriptBody: "కథ",
      deity: null,
      scenePrompt: null,
      scripture: null,
      reference: null,
      count: 3,
    });
    expect(prompt).toContain("a Purana");
    expect(prompt).not.toContain("centred on");
    expect(prompt).toContain("Return exactly 3 prompts.");
  });
});

describe("normaliseShots", () => {
  const anchor = "Vishnu over the lake";

  it("returns exactly what was asked for when the model complies", () => {
    const shots = normaliseShots(
      ["a wide shot of the lake at dawn", "the crocodile closes on the leg"],
      2,
      anchor,
    );
    expect(shots).toHaveLength(2);
  });

  it("trims a list that came back too long", () => {
    const raw = Array.from({ length: 9 }, (_, i) => `shot number ${i} of the story`);
    expect(normaliseShots(raw, 4, anchor)).toHaveLength(4);
  });

  it("pads a short list by repeating from the start", () => {
    const shots = normaliseShots(["the wide establishing view of the lake"], 3, anchor);
    expect(shots).toHaveLength(3);
    expect(new Set(shots).size).toBe(1);
  });

  it("drops one-word answers, which are the model failing rather than being terse", () => {
    const shots = normaliseShots(["Vishnu", "the elephant lifts a lotus to the sky"], 2, anchor);
    expect(shots.every((s) => s.includes("elephant"))).toBe(true);
  });

  it("falls back to the episode's own scene prompt when nothing usable came back", () => {
    expect(normaliseShots(null, 3, anchor)).toEqual([anchor, anchor, anchor]);
    expect(normaliseShots(["", "  "], 2, anchor)).toEqual([anchor, anchor]);
  });

  it("still returns something when there is no anchor either", () => {
    const shots = normaliseShots([], 2, "");
    expect(shots).toHaveLength(2);
    expect(shots[0].length).toBeGreaterThan(0);
  });
});

describe("decorateShot", () => {
  it("puts the figure first, then the scene, then both anchors", () => {
    const out = decorateShot("the elephant lifts a lotus", "Vishnu");
    expect(out.startsWith("Vishnu.")).toBe(true);
    expect(out).toContain("the elephant lifts a lotus");
    expect(out).toContain(STYLE_ANCHOR);
    expect(out).toContain(NEGATIVE_ANCHOR);
  });

  it("omits the figure when the episode never named one", () => {
    expect(decorateShot("a lake at dawn", null).startsWith("a lake at dawn")).toBe(true);
  });

  it("bans the cartoon register on every single image", () => {
    // One drifting shot ruins a run, so this is repeated per image rather
    // than stated once in the shot-list instruction.
    expect(decorateShot("anything", "Shiva")).toContain("not a cartoon");
  });
});
