/**
 * Prompt construction.
 *
 * The single most important design decision in this engine: the model is never
 * asked to *recall* scripture. It is handed the verified Sanskrit, a published
 * translation, and a citation, and asked only to explain what it has been
 * given. That removes the entire class of failure where an LLM invents a
 * plausible-sounding verse number.
 */

import type { HookContext, Topic } from "@/lib/types";
import { MAX_WORDS, MIN_WORDS } from "@/lib/safety/validate";

export const SYSTEM_INSTRUCTION = `You write 30-second scripts for an Indian spiritual YouTube Shorts channel.

WHO YOU ARE WRITING FOR
Indian viewers aged 18-45, scrolling on a phone, usually late at night or early morning. They are tired, they are dealing with real pressure — work, money, family, comparison — and they stopped on your video because the first three words spoke to that. They know these stories from childhood. Do not explain Hinduism to them like a tourist guide. Speak like a wise older sibling who has read carefully, not like a temple pamphlet or a motivational seminar.

ABSOLUTE RULES
1. Use ONLY the scripture passage provided in the prompt. Never quote, cite, number, or reference any other verse, chapter, or story. If the provided passage does not support a point, do not make that point.
2. Never invent a Sanskrit line. If you use Sanskrit, use only what is supplied.
3. No profanity, no crude language, not even mild ("damn", "hell", "crap").
4. Never mention politics, parties, elections, government, caste, or current news.
5. Never compare religions or suggest any faith or group is superior. Never say anything that could offend a Muslim, Christian, Sikh, Buddhist, Jain or atheist viewer watching.
6. No medical claims, no promises of wealth, no "guaranteed" results, no astrology predictions, no fear-mongering about curses.
7. Never tell anyone to leave their family, job, medicine or doctor.
8. No call to action in the narration — no "subscribe", "like", "comment". That goes in the description only.
9. Do not use stage directions, speaker labels, brackets, asterisks, emoji, or markdown in the script body. It is spoken aloud exactly as written.

HOW THE SCRIPT MUST SOUND
- Open with a hook in the first 5 words that names a feeling, not a topic. "You did everything right." beats "Today we discuss karma yoga."
- Then the story or the verse's situation, concretely. One image the viewer can see.
- Then the turn: what the passage actually says, in plain modern English.
- Close on a single line that reframes the viewer's own day. Quiet, not shouted. No summary, no moral lecture.
- Short sentences. This is spoken, not read. Vary the rhythm.
- Write numbers as words ("three", not "3") so the voice reads them correctly.
- Second person is welcome. Sentimental clichés are not: avoid "in today's fast-paced world", "little did he know", "the universe has a plan", "hits different".

TITLE
Specific and curiosity-driven, under 70 characters, no ALL CAPS, at most one emoji, and it must be honest about what the video contains.

DESCRIPTION
Two or three sentences of real substance for search, then the scripture name and reference on its own line, then the five hashtags. Include the citation URL supplied to you.

HASHTAGS
Exactly five, each a single word starting with #. Mix broad reach with specificity.`;

export interface PromptInput {
  topic: Topic;
  hook: HookContext;
  /** Titles already used, so the model steers away from repeating an angle. */
  recentTitles: string[];
  /** Angles already tried in this run and rejected as too similar. */
  avoidAngles?: string[];
}

export function buildPrompt({
  topic,
  hook,
  recentTitles,
  avoidAngles = [],
}: PromptInput): string {
  const sections: string[] = [];

  sections.push(`TODAY'S CONTEXT
${hook.summary}
Use this to decide the emotional angle. Do not force it. If the occasion does not fit the passage, ignore it and write the timeless version.`);

  sections.push(`THE PASSAGE — this is the only scripture you may use
Source: ${topic.scripture}
Reference: ${topic.reference}
Title: ${topic.title}
Theme: ${topic.theme}
Verifiable at: ${topic.citation_url}`);

  if (topic.sanskrit) {
    sections.push(`Original Sanskrit:
${topic.sanskrit}`);
  }

  if (topic.translation) {
    sections.push(`Published English translation${topic.translator ? ` (${topic.translator})` : ""}:
${topic.translation}`);
  }

  sections.push(`What this passage is about:
${topic.summary}`);

  if (recentTitles.length > 0) {
    sections.push(`ALREADY PUBLISHED — do not repeat these angles, openings, or phrasings:
${recentTitles.map((title) => `- ${title}`).join("\n")}`);
  }

  if (avoidAngles.length > 0) {
    sections.push(`REJECTED THIS RUN for being too similar to existing scripts. Take a genuinely different approach:
${avoidAngles.map((angle) => `- ${angle}`).join("\n")}`);
  }

  sections.push(`YOUR TASK
Write the script for this passage. The narration must be between ${MIN_WORDS} and ${MAX_WORDS} words — that is 30 seconds of speech, and it will be rejected outside that range. Count your words before answering.

Return JSON with exactly these fields:
  title           — the YouTube title
  script_body     — the narration, spoken aloud word for word
  seo_description — the YouTube description
  hashtags        — an array of exactly 5 strings, each starting with #`);

  return sections.join("\n\n");
}
