/**
 * Where the pictures actually come from.
 *
 * This file exists because the first answer was wrong. Gemini's image models
 * looked like the obvious choice — the key was already in Settings, the
 * rotation already worked — and the free tier refused every request with
 * `limit: 0`. Not "you have used your allowance": the allowance for image
 * models on the free tier is zero, and no number of extra keys multiplies zero
 * into something. Image generation on Gemini needs billing enabled.
 *
 * So the source became a setting, and this is the seam. Three of them, and
 * each is a genuinely different bargain:
 *
 *  - pollinations  free, no account at all, and the one that works today.
 *                  Returns 576x1024 whatever you ask for, from a small fast
 *                  model, so faces are the weak point. Right aspect, soft.
 *  - cloudflare    free, 10,000 neurons a day that reset at midnight UTC, on
 *                  FLUX-1-schnell — a better model. Costs a free account and
 *                  an API token, and its only parameters are prompt and seed,
 *                  so the image comes back square and has to be cropped.
 *  - gemini        the best of the three and the only one that is not free.
 *                  Kept because "turn billing on" is a decision the operator
 *                  may well make once the channel earns anything.
 *
 * Every provider returns bytes or throws. Deciding what a failure means to the
 * run belongs to the caller.
 */

import { GoogleGenAI } from "@google/genai";

import { withGeminiTarget } from "@/lib/gemini/rotate";
import type { GeminiTarget } from "@/lib/pipeline/cooldown";
import type { AppConfig } from "@/lib/settings/config";
import { HEIGHT, WIDTH } from "@/lib/render/video";

export interface DrawnImage {
  bytes: Buffer;
  mimeType: string;
}

export interface ImageProvider {
  name: string;
  /**
   * Milliseconds to leave between requests when the operator has not set a
   * pace of their own. Gemini's image models are limited to roughly two a
   * minute; the other two are not metered per minute at all.
   */
  defaultPaceMs: number;
  draw(prompt: string, cfg: AppConfig, seed: number): Promise<DrawnImage>;
}

/** Thrown when going on to the next shot cannot possibly help. */
export class ImageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageQuotaError";
  }
}

/** Pull the first inline image out of a Gemini generateContent response. */
export function imageFromGeminiResponse(response: unknown): DrawnImage {
  const parts =
    (response as { candidates?: Array<{ content?: { parts?: unknown[] } }> })?.candidates?.[0]
      ?.content?.parts ?? [];

  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } })?.inlineData;
    if (inline?.data) {
      return { bytes: Buffer.from(inline.data, "base64"), mimeType: inline.mimeType ?? "image/png" };
    }
  }
  throw new Error("The image model returned no image — only text.");
}

/** A quota refusal reads the same from every provider, and ends the run. */
export function isQuotaRefusal(error: unknown): boolean {
  if (error instanceof ImageQuotaError) return true;
  const message = (error as Error)?.message ?? "";
  return (
    /RESOURCE_EXHAUSTED/i.test(message) ||
    /\blimit:\s*0\b/i.test(message) ||
    /quota/i.test(message) ||
    /\b429\b/.test(message)
  );
}

const pollinations: ImageProvider = {
  name: "pollinations",
  // No per-minute metering, but it renders on request and a burst is rude.
  defaultPaceMs: 1_500,
  async draw(prompt, _cfg, seed) {
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${WIDTH}&height=${HEIGHT}&nologo=true&seed=${seed}`;

    const response = await fetch(url, { headers: { "user-agent": "content-engine/1.0" } });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      const error = new Error(`Pollinations returned HTTP ${response.status}. ${detail}`);
      if (response.status === 429) throw new ImageQuotaError(error.message);
      throw error;
    }

    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      throw new Error(`Pollinations returned ${type || "no content type"} rather than an image.`);
    }
    return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: type.split(";")[0] };
  },
};

const cloudflare: ImageProvider = {
  name: "cloudflare",
  defaultPaceMs: 1_000,
  async draw(prompt, cfg, seed) {
    if (!cfg.cloudflareAccountId || !cfg.cloudflareApiToken) {
      throw new ImageQuotaError(
        "Cloudflare is the chosen image source but the account ID or API token is missing. " +
          "Add both in Settings under Connections, or switch the image source to pollinations.",
      );
    }

    const url =
      `https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}` +
      `/ai/run/${cfg.cloudflareImageModel}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.cloudflareApiToken}`,
        "Content-Type": "application/json",
      },
      // flux-1-schnell takes a prompt and a seed and nothing else — no width,
      // no height. The image comes back square and the Ken Burns crop is what
      // turns it into 9:16, which is why the shot prompts ask for a centred
      // subject rather than a wide composition.
      body: JSON.stringify({ prompt, seed }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      result?: { image?: string };
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok) {
      const detail = body.errors?.map((e) => e.message).join("; ") || `HTTP ${response.status}`;
      if (response.status === 429 || /quota|limit/i.test(detail)) {
        throw new ImageQuotaError(`Cloudflare refused: ${detail}`);
      }
      throw new Error(`Cloudflare returned HTTP ${response.status}: ${detail}`);
    }

    const base64 = body.result?.image;
    if (!base64) throw new Error("Cloudflare returned no image in the response body.");
    return { bytes: Buffer.from(base64, "base64"), mimeType: "image/jpeg" };
  },
};

const gemini: ImageProvider = {
  name: "gemini",
  // Roughly two a minute on the paid tier's lowest rung, and going faster
  // earns a refusal that costs a request and returns nothing.
  defaultPaceMs: 31_000,
  async draw(prompt, cfg) {
    return withGeminiTarget(
      "image",
      cfg.geminiApiKeys,
      cfg.imageModels,
      async (target: GeminiTarget) => {
        const response = await new GoogleGenAI({ apiKey: target.key }).models.generateContent({
          model: target.model,
          contents: prompt,
        });
        return imageFromGeminiResponse(response);
      },
    );
  },
};

const PROVIDERS: Record<string, ImageProvider> = { pollinations, cloudflare, gemini };

/** The configured source, falling back to the one that needs no account. */
export function providerFor(name: string): ImageProvider {
  return PROVIDERS[(name ?? "").trim().toLowerCase()] ?? pollinations;
}

/** The gap to leave between requests: the operator's number, else the provider's. */
export function paceFor(provider: ImageProvider, configured: number): number {
  return Number.isFinite(configured) && configured >= 0 ? configured : provider.defaultPaceMs;
}
