/**
 * Prompt construction.
 *
 * The single most important design decision in this engine: the model is never
 * asked to *recall* scripture. It is handed the verified Sanskrit, a published
 * translation, and a citation, and asked only to explain what it has been
 * given. That removes the entire class of failure where an LLM invents a
 * plausible-sounding verse number.
 */

import { MASTER_SYSTEM_PROMPT } from "@/lib/gemini/master-prompt";
import { PURANA_BY_NAME } from "@/lib/sources/mahapuranas";
import type { HookContext, Topic } from "@/lib/types";
import { MAX_WORDS, MIN_WORDS } from "@/lib/safety/validate";

/**
 * The system instruction handed to Gemini on every call. Lives in its own
 * module because it is edited far more often than this file's plumbing.
 */
export const SYSTEM_INSTRUCTION = MASTER_SYSTEM_PROMPT;

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

  // When the topic belongs to one of the eighteen Maha Puranas, tell the model
  // what kind of text it is holding. A Garuda Purana script and a Bhagavata
  // Purana script should not feel the same, and the registry knows the
  // difference so the prompt does not have to hardcode it.
  const purana = topic.scripture ? PURANA_BY_NAME.get(topic.scripture) : undefined;
  if (purana) {
    sections.push(`TODAY'S PURANA — number ${purana.order} of the eighteen Maha Puranas
${purana.name} (${purana.sanskritName}) · ${purana.presidingDeity} · ${purana.verses.toLocaleString("en-IN")} verses by tradition
Character of this text: ${purana.character}
It is the natural home for: ${purana.themes.join(", ")}.
Let that character colour the tone. Do not state any of these facts in the script — they are for you, not the viewer.`);
  }

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
