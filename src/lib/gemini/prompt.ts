/**
 * Prompt construction.
 *
 * The single most important design decision in this engine: the model is never
 * asked to *recall* scripture. It is handed the verified Sanskrit, a published
 * translation, and a citation, and asked only to explain what it has been
 * given. That removes the entire class of failure where an LLM invents a
 * plausible-sounding verse number.
 */

import { buildMasterPrompt } from "@/lib/gemini/master-prompt";
import { PURANA_BY_NAME } from "@/lib/sources/mahapuranas";
import type { HookContext, Topic } from "@/lib/types";
import { wordWindow, type AppConfig } from "@/lib/settings/config";

/**
 * The system instruction handed to Gemini on every call. A function rather
 * than a constant because its beat sheet is computed from the configured
 * length, which is now editable at runtime.
 */
export function systemInstruction(cfg: AppConfig): string {
  return buildMasterPrompt(cfg.targetSeconds);
}

export interface PromptInput {
  topic: Topic;
  hook: HookContext;
  /** Titles already used, so the model steers away from repeating an angle. */
  recentTitles: string[];
  /** Angles already tried in this run and rejected as too similar. */
  avoidAngles?: string[];
  /**
   * What the channel's own published videos say works, already rendered as
   * prose by lib/learning. Null until there is enough measured work to have
   * an opinion, and null is not the same as an empty section: an empty "what
   * works" heading reads to a model as "nothing works".
   */
  learningBrief?: string | null;
  /** Runtime configuration: drives the word window and the target length. */
  cfg: AppConfig;
}

export function buildPrompt({
  topic,
  hook,
  recentTitles,
  avoidAngles = [],
  learningBrief = null,
  cfg,
}: PromptInput): string {
  const { min: MIN_WORDS, max: MAX_WORDS } = wordWindow(cfg);
  const sections: string[] = [];

  sections.push(`TODAY'S CONTEXT
${hook.summary}
Use this only to choose which part of the episode to dwell on — a Shiva festival is a reason to linger on a Shiva episode's central moment, nothing more. Never mention the occasion, the date or the season in the script, and never use it to connect the story to the viewer's own week. If it does not fit the passage, ignore it completely.`);

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

  // Last, because it is guidance rather than material, and because the model
  // weights the end of a long prompt more heavily than its middle.
  if (learningBrief) sections.push(learningBrief);

  sections.push(`YOUR TASK
Write the script for this passage. The narration must be between ${MIN_WORDS} and ${MAX_WORDS} words — that is ${cfg.targetSeconds} seconds of speech, and it will be rejected outside that range. Count your words before answering.

Return JSON with exactly these fields:
  title           — the YouTube title
  script_body     — the narration, spoken aloud word for word
  seo_description — the YouTube description
  hashtags        — an array of exactly 8 strings, each starting with #
  tone            — "soft" or "intense"
  deity           — the one figure this episode is about
  scene_prompt    — one sentence describing the image it should show`);

  return sections.join("\n\n");
}
