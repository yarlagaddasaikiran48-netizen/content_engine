import { fail, messageOf, ok } from "@/lib/api";
import { generateVideo } from "@/lib/pipeline/generate-video";

/**
 * POST /api/generate — produce one new script + audio and queue it as pending.
 *
 * Node runtime is required: the Edge TTS client opens a raw WebSocket with
 * custom headers, which the Edge runtime does not support.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gemini (~4-8s) + Edge TTS (~3-6s) + two Supabase round trips, times up to
 * four attempts if scripts get rejected. 60s is the Vercel Hobby ceiling.
 */
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await generateVideo();

    if (!result.ok) {
      return fail(result.error ?? "Generation failed.", 422, {
        attempts: result.attempts,
        log: result.log,
      });
    }

    return ok({
      video: result.video,
      attempts: result.attempts,
      log: result.log,
    });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}

/** Convenience for triggering a run from a browser address bar. */
export async function GET() {
  return POST();
}
