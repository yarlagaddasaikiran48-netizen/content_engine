import { fail, messageOf, ok } from "@/lib/api";
import { config } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/publish/callback
 *
 * Called by the GitHub Actions renderer at each stage:
 *   { status: "rendering" }
 *   { status: "published", youtube_video_id: "..." }
 *   { status: "failed", error: "..." }
 *
 * Authenticated with a shared secret in `x-publish-secret`, compared in
 * constant time. Without a configured secret the endpoint refuses everything —
 * it must never be an open write to the queue.
 */

/** Length-safe, timing-safe string comparison. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  try {
    if (!config.publishCallbackSecret) {
      return fail(
        "PUBLISH_CALLBACK_SECRET is not configured on this deployment.",
        503,
      );
    }
    if (!secretMatches(request.headers.get("x-publish-secret"), config.publishCallbackSecret)) {
      return fail("Unauthorized.", 401);
    }

    const body = (await request.json().catch(() => ({}))) as {
      video_id?: string;
      status?: string;
      youtube_video_id?: string;
      error?: string;
    };

    if (!body.video_id) return fail("Missing video_id.", 400);

    const supabase = supabaseAdmin();
    const now = new Date().toISOString();

    switch (body.status) {
      case "rendering": {
        const { error } = await supabase
          .from("spiritual_videos")
          .update({ status: "rendering" })
          .eq("id", body.video_id);
        if (error) return fail(error.message, 500);
        return ok({ status: "rendering" });
      }

      case "published": {
        if (!body.youtube_video_id) {
          return fail("Missing youtube_video_id for a published callback.", 400);
        }
        const { error } = await supabase
          .from("spiritual_videos")
          .update({
            status: "published",
            youtube_video_id: body.youtube_video_id,
            youtube_url: `https://www.youtube.com/shorts/${body.youtube_video_id}`,
            published_at: now,
            error_message: null,
          })
          .eq("id", body.video_id);
        if (error) return fail(error.message, 500);
        return ok({ status: "published" });
      }

      case "failed": {
        const { data: existing } = await supabase
          .from("spiritual_videos")
          .select("render_attempts")
          .eq("id", body.video_id)
          .maybeSingle();

        const { error } = await supabase
          .from("spiritual_videos")
          .update({
            status: "failed",
            error_message: (body.error ?? "Renderer reported a failure.").slice(0, 2_000),
            render_attempts: (existing?.render_attempts ?? 0) + 1,
          })
          .eq("id", body.video_id);
        if (error) return fail(error.message, 500);
        return ok({ status: "failed" });
      }

      default:
        return fail(`Unknown status "${body.status ?? ""}".`, 400);
    }
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
