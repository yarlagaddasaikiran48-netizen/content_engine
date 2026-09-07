/**
 * Structural validation of a generated script.
 *
 * Gemini returns JSON matching a schema, so the *shape* is guaranteed. What is
 * not guaranteed is that the content is usable: the right spoken length for a
 * 30-second Short, a title that fits YouTube's limit, exactly five clean
 * hashtags, and no stage directions left in the narration.
 */

import { checkSafety, type SafetyIssue } from "@/lib/safety/profanity";
import type { GeneratedScript } from "@/lib/types";

/**
 * Measured, not guessed: en-IN-NeerjaNeural at rate -4% renders 26 words in
 * 10.51 seconds — 148 words per minute. A 30-second script is therefore ~74
 * words, and this window keeps the spoken result between roughly 27 and 35
 * seconds, which is the sweet spot for a Short.
 */
export const MIN_WORDS = 66;
export const MAX_WORDS = 86;

/** YouTube hard limits. */
const MAX_TITLE_CHARS = 100;
const MAX_DESCRIPTION_CHARS = 4_900;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  safetyIssues: SafetyIssue[];
  /** The cleaned-up script, safe to store. Only meaningful when `valid`. */
  cleaned: GeneratedScript;
  wordCount: number;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Strip anything that would be read aloud but shouldn't be: stage directions,
 * speaker labels, markdown emphasis, and stray quotes around the whole body.
 */
function cleanNarration(body: string): string {
  return body
    .replace(/\((?:pause|beat|music|sfx|sound|voice[^)]*)\)/gi, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/^\s*(narrator|voice ?over|vo|host)\s*:\s*/gim, "")
    .replace(/[*_`#]+/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/[*_`#]+/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise to `#OneWord`, drop anything that cannot be salvaged. */
function cleanHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of tags) {
    const cleaned = `#${String(raw)
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}]/gu, "")}`;
    if (cleaned.length < 3 || cleaned.length > 40) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export function validateScript(script: GeneratedScript): ValidationResult {
  const errors: string[] = [];

  const title = cleanTitle(script.title ?? "");
  const body = cleanNarration(script.script_body ?? "");
  const description = (script.seo_description ?? "").trim();
  const hashtags = cleanHashtags(script.hashtags ?? []);

  // ---- title ----
  if (title.length < 12) errors.push("Title is too short (minimum 12 characters).");
  if (title.length > MAX_TITLE_CHARS) {
    errors.push(`Title is ${title.length} characters; YouTube allows ${MAX_TITLE_CHARS}.`);
  }
  if (title === title.toUpperCase() && /[A-Z]{6,}/.test(title)) {
    errors.push("Title is shouting in all caps.");
  }

  // ---- body ----
  const wordCount = countWords(body);
  if (wordCount < MIN_WORDS) {
    errors.push(`Script is ${wordCount} words; too short for 30 seconds (minimum ${MIN_WORDS}).`);
  }
  if (wordCount > MAX_WORDS) {
    errors.push(`Script is ${wordCount} words; too long for 30 seconds (maximum ${MAX_WORDS}).`);
  }
  if (/\b(subscribe|like and share|hit the bell|comment below)\b/i.test(body)) {
    errors.push("Narration contains a call to action; that belongs in the description, not the audio.");
  }

  // ---- description ----
  if (description.length < 60) {
    errors.push("SEO description is too short (minimum 60 characters).");
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    errors.push(`SEO description exceeds ${MAX_DESCRIPTION_CHARS} characters.`);
  }

  // ---- hashtags ----
  if (hashtags.length !== 5) {
    errors.push(`Expected exactly 5 usable hashtags, got ${hashtags.length}.`);
  }

  // ---- safety, across everything ----
  const safety = checkSafety(title, body, description, hashtags.join(" "));
  if (!safety.safe) {
    errors.push(
      `Safety filter rejected the script: ${safety.issues
        .map((issue) => `${issue.category} (${issue.detail})`)
        .join(", ")}.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    safetyIssues: safety.issues,
    cleaned: {
      title,
      script_body: body,
      seo_description: description,
      hashtags,
    },
    wordCount,
  };
}
