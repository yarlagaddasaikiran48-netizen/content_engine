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
