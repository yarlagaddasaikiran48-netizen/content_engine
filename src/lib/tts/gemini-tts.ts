/**
 * Narration through Gemini's speech models.
 *
 * The reason for a second provider is not redundancy, it is prosody. Edge TTS
 * offers exactly two Telugu voices and one flat `<prosody>` wrapper, with no
 * expressive style support for te-IN, so a Telugu narration comes out evenly
 * paced from the first word to the last however the rate is tuned.
 *
 * Gemini's TTS models are language models that decide *how* to say a line, not
 * only what the phonemes are. They take direction in plain language — an audio
 * profile, a scene, and notes on pace and delivery — which is what a storyteller
 * narration actually needs. Google's own guide frames it as directing a voice
 * actor, and that framing is why `stylePrompt` is prepended to the transcript
 * rather than passed as a parameter: the model reads it as instruction.
 *
 * Output is raw 16-bit PCM. See wav.ts for why it is wrapped rather than
 * transcoded.
 */

import { GoogleGenAI } from "@google/genai";

import type { AudioFormat, SynthesisResult } from "@/lib/tts/edge-tts";
import { pcmDurationSeconds, pcmRateFromMimeType, wrapPcmAsWav } from "@/lib/tts/wav";

/** Free on the free tier, for both text in and audio out, as of 2026-09-08. */
export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";

export interface GeminiSynthesizeOptions {
  apiKey: string;
  /** A prebuilt voice name, e.g. "Charon" or "Kore". */
  voice: string;
  /** Director's notes prepended to the transcript. */
  stylePrompt?: string;
  model?: string;
}

export class GeminiTTSError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GeminiTTSError";
  }
}

/**
 * The instruction and the transcript, in the order the model expects them.
 *
 * Kept separate from the request so it can be tested without a network call,
 * and so the exact string reaching the model is inspectable — the difference
 * between a warm narration and a news reader is entirely in this text.
 */
export function buildSpeechRequest(text: string, stylePrompt?: string): string {
  const notes = (stylePrompt ?? "").trim();
  if (!notes) return text;
  // A trailing colon reads as "what follows is the thing to perform", which is
  // the shape every example in Google's prompting guide uses.
  const withColon = notes.endsWith(":") ? notes : `${notes}:`;
  return `${withColon}\n\n${text}`;
}

/**
 * Pull the audio out of a generateContent response.
 *
 * Exported for tests: the shape is deep enough that a change in the SDK would
 * otherwise only be discovered in production, and a TTS call is the one request
 * in this pipeline that cannot be cheaply retried by hand.
 */
export function audioFromResponse(response: unknown): { pcm: Buffer; rate: number } {
  const part = (
    response as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
    }
  )?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);

  const data = part?.inlineData?.data;
  if (!data) {
    throw new GeminiTTSError("Gemini returned no audio. The response carried no inline data.");
  }

  return {
    pcm: Buffer.from(data, "base64"),
    rate: pcmRateFromMimeType(part?.inlineData?.mimeType),
  };
}

export async function synthesizeWithGemini(
  text: string,
  options: GeminiSynthesizeOptions,
): Promise<SynthesisResult> {
  const clean = text.trim();
  if (!clean) throw new GeminiTTSError("Cannot synthesize empty text.");
  if (!options.apiKey) throw new GeminiTTSError("A Gemini API key is required for Gemini TTS.");

  const model = options.model?.trim() || DEFAULT_GEMINI_TTS_MODEL;
  let response: unknown;

  try {
    response = await new GoogleGenAI({ apiKey: options.apiKey }).models.generateContent({
      model,
      contents: buildSpeechRequest(clean, options.stylePrompt),
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } },
        },
      },
    });
  } catch (error) {
    throw new GeminiTTSError(
      `Gemini TTS request failed (${model}): ${(error as Error)?.message ?? "unknown error"}`,
      error,
    );
  }

  const { pcm, rate } = audioFromResponse(response);
  const audio = wrapPcmAsWav(pcm, rate);

  return {
    audio,
    // Uncompressed audio has an exact length; measure the samples, not the file.
    durationSeconds: Number(pcmDurationSeconds(pcm.length, rate).toFixed(2)),
    voice: options.voice,
    bytes: audio.length,
    format: "wav" satisfies AudioFormat,
  };
}
