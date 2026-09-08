/**
 * Which engine speaks the narration.
 *
 * Two providers, one seam. The pipeline calls `speak()` and never learns which
 * engine answered, except through the log line and the `format` on the result.
 *
 * Gemini is the default because it is the only one of the two that can be
 * directed, but it is a preview model on a free tier: it can be rate-limited,
 * and Google documents that its output voice does not always match the voice
 * requested. Edge is therefore kept, not as a legacy path but as the thing that
 * answers when Gemini will not.
 *
 * The fallback is always logged. A channel whose voice quietly changes halfway
 * through a week is worse than one that fails loudly, because nobody finds out
 * until a viewer does.
 */

import type { AppConfig } from "@/lib/settings/config";
import { synthesize as synthesizeWithEdge, type SynthesisResult } from "@/lib/tts/edge-tts";
import { synthesizeWithGemini } from "@/lib/tts/gemini-tts";

export type { AudioFormat, SynthesisResult } from "@/lib/tts/edge-tts";

/** File extension for a synthesis result, without the dot. */
export function extensionFor(result: Pick<SynthesisResult, "format">): string {
  return result.format;
}

/** The storage content type for a synthesis result. */
export function contentTypeFor(result: Pick<SynthesisResult, "format">): string {
  return result.format === "wav" ? "audio/wav" : "audio/mpeg";
}

function edge(text: string, cfg: AppConfig): Promise<SynthesisResult> {
  return synthesizeWithEdge(text, {
    voice: cfg.ttsVoice,
    rate: cfg.ttsRate,
    pitch: cfg.ttsPitch,
    volume: cfg.ttsVolume,
  });
}

export interface SpeakOptions {
  /** Lines describing what happened, appended in place. Fallbacks land here. */
  log?: string[];
}

export async function speak(
  text: string,
  cfg: AppConfig,
  options: SpeakOptions = {},
): Promise<SynthesisResult> {
  if (cfg.ttsProvider !== "gemini") return edge(text, cfg);

  if (!cfg.geminiApiKey) {
    options.log?.push("  voice: Gemini is selected but has no API key; used Edge instead.");
    return edge(text, cfg);
  }

  try {
    return await synthesizeWithGemini(text, {
      apiKey: cfg.geminiApiKey,
      voice: cfg.ttsGeminiVoice,
      stylePrompt: cfg.ttsStylePrompt,
    });
  } catch (error) {
    // Deliberately not rethrown. A failed narration would throw away a script
    // that already cost a generation, and Edge can still say the words.
    options.log?.push(
      `  voice: Gemini TTS failed (${(error as Error)?.message ?? "unknown error"}); used Edge instead.`,
    );
    return edge(text, cfg);
  }
}
