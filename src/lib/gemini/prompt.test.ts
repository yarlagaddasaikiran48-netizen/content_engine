import { describe, expect, it } from "vitest";

import { buildPrompt } from "@/lib/gemini/prompt";
import type { AppConfig } from "@/lib/settings/config";
import type { HookContext, Topic } from "@/lib/types";

const cfg = {
  targetSeconds: 60,
  ttsWordsPerMinute: 80,
  wordCountTolerance: 0.15,
} as AppConfig;

const topic = {
  topic_key: "purana:markandeya:markandeya",
  source: "purana",
  scripture: "Markandeya Purana",
  reference: "Chapters 1-2",
  title: "When death came for Markandeya",
  theme: "devotion outlasting a fixed span",
  summary: "A boy promised only sixteen years clings to the Shiva linga as Yama's noose falls.",
  citation_url: "https://www.wisdomlib.org/hinduism/book/markandeya-purana",
} as Topic;

const hook = {
  summary: "Today is Maha Shivaratri.",
} as HookContext;

describe("buildPrompt", () => {
  it("passes the occasion without inviting a bridge to the viewer's week", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], cfg });
    expect(prompt).toContain("Maha Shivaratri");
    expect(prompt).not.toMatch(/decide the emotional angle/i);
    expect(prompt).toMatch(/which part of the episode to dwell on/i);
  });

  it("still carries the passage and the word window", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], cfg });
    expect(prompt).toContain("Markandeya Purana");
    expect(prompt).toContain("Chapters 1-2");
    // 60s at 80 wpm is 80 words, +/- 15% => 68 to 92.
    expect(prompt).toContain("between 68 and 92 words");
  });
});

/**
 * The learning brief is the channel's own history read back to the writer.
 *
 * Two things about it matter enough to pin down. It must be absent, not empty,
 * before the channel has measured anything — an empty "what works" heading
 * reads to a model as "nothing works". And when it is present it must sit
 * after the material and immediately before the instruction, because that is
 * the part of a long prompt the model weights most heavily.
 */
const BRIEF = [
  "WHAT THIS CHANNEL HAS LEARNED — measured over 11 published videos, not guessed",
  "",
  "- Episodes about Shiva hold 71% of viewers past the first three seconds; episodes about Vishnu hold 52%.",
  "",
  "The openings that held the most people:",
  "- Yama's noose fell.",
].join("\n");

describe("buildPrompt learning brief", () => {
  it("leaves no trace of a brief when there is none to give", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], cfg });

    expect(prompt).not.toContain("WHAT THIS CHANNEL HAS LEARNED");
    expect(prompt).not.toMatch(/learned/i);
  });

  it("leaves no trace when the brief is explicitly null", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], learningBrief: null, cfg });

    expect(prompt).not.toContain("WHAT THIS CHANNEL HAS LEARNED");
  });

  it("carries the brief through word for word when there is one", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], learningBrief: BRIEF, cfg });

    expect(prompt).toContain(BRIEF);
  });

  it("places the brief after the passage and before the task", () => {
    const prompt = buildPrompt({
      topic,
      hook,
      recentTitles: ["An older episode about Markandeya"],
      avoidAngles: ["The boy who bargained with death"],
      learningBrief: BRIEF,
      cfg,
    });

    const passage = prompt.indexOf("THE PASSAGE");
    const summary = prompt.indexOf("What this passage is about:");
    const brief = prompt.indexOf("WHAT THIS CHANNEL HAS LEARNED");
    const task = prompt.indexOf("YOUR TASK");

    expect(passage).toBeGreaterThan(-1);
    expect(brief).toBeGreaterThan(summary);
    expect(summary).toBeGreaterThan(passage);
    expect(task).toBeGreaterThan(brief);
  });

  it("keeps the brief last of the guidance, after the angles already tried", () => {
    const prompt = buildPrompt({
      topic,
      hook,
      recentTitles: ["An older episode about Markandeya"],
      avoidAngles: ["The boy who bargained with death"],
      learningBrief: BRIEF,
      cfg,
    });

    expect(prompt.indexOf("WHAT THIS CHANNEL HAS LEARNED")).toBeGreaterThan(
      prompt.indexOf("REJECTED THIS RUN"),
    );
    expect(prompt.indexOf("REJECTED THIS RUN")).toBeGreaterThan(prompt.indexOf("ALREADY PUBLISHED"));
  });

  it("asks for exactly eight hashtags and names the fields the pipeline reads", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], learningBrief: BRIEF, cfg });
    const task = prompt.slice(prompt.indexOf("YOUR TASK"));

    expect(task).toMatch(/exactly 8 strings/);
    expect(task).not.toMatch(/exactly (?!8\b)\d+ strings/);
    expect(task).toContain("tone");
    expect(task).toMatch(/"soft" or "intense"/);
    expect(task).toContain("deity");
    expect(task).toContain("scene_prompt");
    expect(task).toContain("script_body");
    expect(task).toContain("seo_description");
  });
});
