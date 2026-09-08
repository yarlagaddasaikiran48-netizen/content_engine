/**
 * Drawing the pictures.
 *
 * Two calls, both on the key rotation the scripts and the narration already
 * use: one text request that turns the narration into a shot list, then one
 * image request per shot.
 *
 * Nothing here is allowed to fail a render. Every path returns what it managed
 * to produce, and the caller falls back — filed artwork, then the generated
 * gradient — because a video with a plain background is a video, and a thrown
 * error is a row back on the queue with the day's narration already spent.
 *
 * On pacing: the free image tier allows roughly two images a minute, and the
 * refusal for going faster is a 429 that costs a request without returning a
 * picture. So requests are spaced deliberately. This repository is public, so
 * GitHub Actions minutes are free and unmetered — waiting is the cheapest
 * thing in the whole pipeline, and far cheaper than burning quota on refusals.
 */

import { GoogleGenAI, Type } from "@google/genai";

import { withGeminiTarget } from "@/lib/gemini/rotate";
import type { GeminiTarget } from "@/lib/pipeline/cooldown";
import type { AppConfig } from "@/lib/settings/config";
import {
  buildShotListPrompt,
  decorateShot,
  normaliseShots,
  type ShotListInput,
} from "@/lib/images/shots";

export interface GeneratedImage {
  /** 1-based position in the story, so a failure leaves an obvious hole. */
  index: number;
  prompt: string;
  bytes: Buffer;
  mimeType: string;
}

const SHOT_LIST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    shots: {
      type: Type.ARRAY,
      description:
        "One English image prompt per shot, in the order the story tells them. Each names who is in frame, what they are doing, where, and what the light is doing.",
      items: { type: Type.STRING },
    },
  },
  required: ["shots"],
} as const;

/**
 * Ask for a shot list, and never throw.
 *
 * Returns the anchor repeated when anything at all goes wrong — no key, quota
 * spent, a blocked prompt. The caller cannot tell the difference and should
 * not have to: one repeated image is the old behaviour, which was acceptable
 * yesterday and is acceptable as a floor today.
 */
export async function planShots(
  input: ShotListInput,
  cfg: AppConfig,
  log: string[] = [],
): Promise<string[]> {
  const anchor = (input.scenePrompt ?? "").trim();

  try {
    const shots = await withGeminiTarget(
      "text",
      cfg.geminiApiKeys,
      cfg.geminiModels,
      async (target: GeminiTarget) => {
        const response = await new GoogleGenAI({ apiKey: target.key }).models.generateContent({
          model: target.model,
          contents: buildShotListPrompt(input),
          config: {
            responseMimeType: "application/json",
            responseSchema: SHOT_LIST_SCHEMA,
          },
        });
        const parsed = JSON.parse(response.text ?? "{}") as { shots?: unknown };
        return normaliseShots(parsed.shots, input.count, anchor);
      },
    );
    log.push(`  shots: planned ${shots.length} from the narration.`);
    return shots;
  } catch (error) {
    log.push(
      `  shots: could not plan a shot list (${(error as Error)?.message ?? "unknown error"}); ` +
        `using the episode's single scene prompt for every shot.`,
    );
    return normaliseShots([], input.count, anchor);
  }
}

/** Pull the first inline image out of a generateContent response. */
export function imageFromResponse(response: unknown): { bytes: Buffer; mimeType: string } {
  const parts =
    (response as { candidates?: Array<{ content?: { parts?: unknown[] } }> })?.candidates?.[0]
      ?.content?.parts ?? [];

  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } })?.inlineData;
    if (inline?.data) {
      return {
        bytes: Buffer.from(inline.data, "base64"),
        mimeType: inline.mimeType ?? "image/png",
      };
    }
  }
  throw new Error("The image model returned no image — only text.");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Draw every shot, in order, skipping the ones that fail.
 *
 * A skipped shot is not an error. The sequence is rebuilt from whatever came
 * back, so eleven images out of twelve is a video that is one shot shorter,
 * not a video that did not render.
 */
export async function drawShots(
  shots: readonly string[],
  deity: string | null,
  cfg: AppConfig,
  log: string[] = [],
): Promise<GeneratedImage[]> {
  if (!cfg.imagesEnabled) {
    log.push("  images: turned off in Settings; using filed artwork or the gradient.");
    return [];
  }
  if (cfg.geminiApiKeys.length === 0 || cfg.imageModels.length === 0) {
    log.push("  images: no Gemini key or image model configured; skipping generation.");
    return [];
  }

  const out: GeneratedImage[] = [];

  for (let i = 0; i < shots.length; i++) {
    // Before the request rather than after it, so a failure still pays the
    // spacing — a 429 that is retried immediately earns another 429.
    if (i > 0 && cfg.imagePaceMs > 0) await sleep(cfg.imagePaceMs);

    const prompt = decorateShot(shots[i], deity);
    try {
      const image = await withGeminiTarget(
        "image",
        cfg.geminiApiKeys,
        cfg.imageModels,
        async (target: GeminiTarget) => {
          const response = await new GoogleGenAI({ apiKey: target.key }).models.generateContent({
            model: target.model,
            contents: prompt,
          });
          return imageFromResponse(response);
        },
      );
      out.push({ index: i + 1, prompt, bytes: image.bytes, mimeType: image.mimeType });
      log.push(`  image ${i + 1}/${shots.length}: ${(image.bytes.length / 1024).toFixed(0)} KB`);
    } catch (error) {
      log.push(
        `  image ${i + 1}/${shots.length}: failed (${(error as Error)?.message ?? "unknown error"}) — skipped.`,
      );
    }
  }

  return out;
}
