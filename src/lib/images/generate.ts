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
import { isQuotaRefusal, paceFor, providerFor } from "@/lib/images/providers";
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

  const provider = providerFor(cfg.imageProvider);
  const pace = paceFor(provider, cfg.imagePaceMs);
  log.push(`  images: drawing with ${provider.name}, ${pace}ms apart.`);

  const out: GeneratedImage[] = [];

  for (let i = 0; i < shots.length; i++) {
    // Before the request rather than after it, so a failure still pays the
    // spacing — a 429 retried immediately earns another 429.
    if (i > 0 && pace > 0) await sleep(pace);

    const prompt = decorateShot(shots[i], deity);
    try {
      // A seed per shot, derived from the position, so a re-render of the same
      // video is not a completely different film.
      const image = await provider.draw(prompt, cfg, 1000 + i);
      out.push({ index: i + 1, prompt, bytes: image.bytes, mimeType: image.mimeType });
      log.push(`  image ${i + 1}/${shots.length}: ${(image.bytes.length / 1024).toFixed(0)} KB`);
    } catch (error) {
      const message = (error as Error)?.message ?? "unknown error";

      // Out of quota is not a failed shot, it is a failed run. The first
      // version carried on through all fifteen, sleeping between each, and
      // spent eight minutes discovering fourteen more times what it already
      // knew. Stop, keep whatever was drawn, and say so once.
      if (isQuotaRefusal(error)) {
        log.push(
          `  image ${i + 1}/${shots.length}: ${provider.name} is out of quota — ` +
            `stopping here with ${out.length} of ${shots.length} drawn. ${message.slice(0, 300)}`,
        );
        break;
      }

      log.push(`  image ${i + 1}/${shots.length}: failed (${message.slice(0, 200)}) — skipped.`);
    }
  }

  return out;
}
