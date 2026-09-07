/**
 * Structural validation of a generated script.
 *
 * Gemini returns JSON matching a schema, so the *shape* is guaranteed. What is
 * not guaranteed is that the content is usable: the right spoken length for
 * the configured Short duration, a title that fits YouTube's limit, exactly five clean
 * hashtags, and no stage directions left in the narration.
 */

import type { AppConfig } from "@/lib/settings/config";
import { wordWindow } from "@/lib/settings/config";
import { checkSafety, stripJoiners, type SafetyIssue } from "@/lib/safety/profanity";
import { isPredominantlyTelugu } from "@/lib/safety/language";
import type { GeneratedScript } from "@/lib/types";

/**
 * The acceptable spoken length, derived rather than hardcoded.
 *
 * The rate is measured, not guessed: te-IN-ShrutiNeural at rate -4% renders 106
 * words in 79.82 seconds — 80 words per minute. Multiply by TARGET_SECONDS to
 * get the ideal length, then allow a tolerance either side.
 *
 * At the defaults (30s, 80 wpm, +/-15%) that is 40 words ideal, 34 to 46
 * accepted. Change TARGET_SECONDS to 45 and the window follows automatically;
 * switch to a different voice or rate and TTS_WORDS_PER_MINUTE retunes it.
 *
 * Telugu runs at barely half the English rate this channel started on — 80 wpm
 * against 148 — because one agglutinative word carries what English needs three
 * or four for. Carrying the English number over would have asked for roughly
 * twice the speech the target allows, and every script would have failed the
 * duration gate. Re-measure with scripts/tts:test if the voice or rate changes.
 */
/** Kept as a function of config rather than a module constant, because the
 *  target length is now editable at runtime from the Settings page. */
export function words(cfg: AppConfig) {
  return wordWindow(cfg);
}

/**
 * Calls to action in Telugu. These are the English words as Telugu speakers
 * actually write them, spelled in Telugu letters — which is how the model will
 * produce them if it produces them at all. Matched after zero-width joiners are
 * stripped, since those split a word invisibly.
 */
const TELUGU_CTA = [
  "సబ్స్క్రైబ్", "లైక్ చేయ", "షేర్ చేయ", "కామెంట్ చేయ", "ఫాలో అవ్వ", "ఫాలో చేయ",
];

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

export function validateScript(script: GeneratedScript, cfg: AppConfig): ValidationResult {
  const { min: MIN_WORDS, max: MAX_WORDS } = wordWindow(cfg);
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
  // The alphabet comes first: every other check below passes happily on
  // English, and the mistake only becomes audible in the finished MP3.
  if (!isPredominantlyTelugu(body)) {
    errors.push(
      "Narration is not written in Telugu script. The te-IN voice reads only the " +
        "Telugu alphabet, so English or romanised Telugu produces unusable audio.",
    );
  }

  const wordCount = countWords(body);
  if (wordCount < MIN_WORDS) {
    errors.push(`Script is ${wordCount} words; too short for ${cfg.targetSeconds} seconds (minimum ${MIN_WORDS}).`);
  }
  if (wordCount > MAX_WORDS) {
    errors.push(`Script is ${wordCount} words; too long for ${cfg.targetSeconds} seconds (maximum ${MAX_WORDS}).`);
  }
  const joined = stripJoiners(body);
  const hasCta =
    /\b(subscribe|like and share|hit the bell|comment below)\b/i.test(body) ||
    TELUGU_CTA.some((phrase) => joined.includes(phrase));
  if (hasCta) {
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
