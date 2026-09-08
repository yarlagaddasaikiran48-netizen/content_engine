/**
 * Whose voice tells this episode.
 *
 * The Puranas are not one register. Markandeya hiding behind a Shiva lingam
 * while Yama's noose comes for him is not the same story as Krishna explaining
 * contentment to Uddhava, and a single narrator reading both in the same tone
 * makes the channel sound like a text-to-speech demo rather than someone
 * telling you something.
 *
 * So the model labels each script with the register it wrote in, and that
 * label picks the voice: a woman's for the gentle ones, a man's for the fierce
 * ones. Two voices is the right number — it is enough to stop every video
 * sounding identical, and few enough that the channel still has a recognisable
 * pair of narrators rather than a different stranger every day.
 *
 * Kept apart from lib/tts/index.ts so the mapping can be tested without
 * standing up either speech engine.
 */

import type { AppConfig } from "@/lib/settings/config";

/**
 * The register an episode is written in.
 *
 * "soft" — teaching, devotion, consolation, a quiet turn. A woman's voice.
 * "intense" — wrath, war, a curse, death, a god's judgement. A man's voice.
 */
export type ScriptTone = "soft" | "intense";

export const SCRIPT_TONES: readonly ScriptTone[] = ["soft", "intense"];

/** Anything the model invents that is not a known tone reads as the gentler one. */
export function normaliseTone(value: unknown): ScriptTone {
  return value === "intense" ? "intense" : "soft";
}

export interface VoiceChoice {
  /** Edge voice name, e.g. te-IN-ShrutiNeural. */
  edge: string;
  /** Gemini prebuilt voice name, e.g. Kore. */
  gemini: string;
  /**
   * Direction read by the Gemini speech model as instruction, not spoken.
   * This is the whole reason Gemini is preferred over Edge: Edge takes a rate
   * and a pitch, where this takes an intention.
   */
  stylePrompt: string;
}

export function voicesFor(tone: ScriptTone, cfg: AppConfig): VoiceChoice {
  if (tone === "intense") {
    return {
      edge: cfg.ttsVoiceIntense,
      gemini: cfg.ttsGeminiVoiceIntense,
      stylePrompt: cfg.ttsStylePromptIntense,
    };
  }
  return {
    edge: cfg.ttsVoice,
    gemini: cfg.ttsGeminiVoice,
    stylePrompt: cfg.ttsStylePrompt,
  };
}
