import { fail, messageOf, ok } from "@/lib/api";
import { config } from "@/lib/env";
import { generateVideo } from "@/lib/pipeline/generate-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/generate
 *
 * Wired to the daily schedule in vercel.json (01:30 UTC = 07:00 IST), so a
 * fresh script is waiting in the queue each morning.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically once
 * CRON_SECRET exists in project settings. `?secret=` is accepted too, for
 * triggering a run by hand. With no secret configured the route stays open,
 * which is fine for a private deployment but worth setting anyway.
 */
export async function GET(request: Request) {
  if (config.cronSecret) {
    const url = new URL(request.url);
    const header = request.headers.get("authorization");
    const supplied =
      header?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
    if (supplied !== config.cronSecret) {
      return fail("Unauthorized.", 401);
    }
  }

  try {
    const result = await generateVideo();
    if (!result.ok) {
      return fail(result.error ?? "Generation failed.", 422, { log: result.log });
    }
    return ok({
      video_id: result.video?.id,
      title: result.video?.title,
      attempts: result.attempts,
      log: result.log,
    });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
