import { fail, messageOf, ok } from "@/lib/api";
import { config, features } from "@/lib/env";
import { dispatchRender } from "@/lib/github/dispatch";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/approve  { id }
 *
 * Marks the row approved and hands it to the GitHub Actions renderer, which
 * builds the MP4 and uploads it to YouTube. The status flow from here is
 * approved -> rendering -> published (or failed), driven by callbacks from the
 * workflow.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return fail("Missing video id.", 400);

    const supabase = supabaseAdmin();

    const { data: video, error: readError } = await supabase
      .from("spiritual_videos")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();

    if (readError) return fail(readError.message, 500);
    if (!video) return fail("Video not found.", 404);

    const current = video as SpiritualVideo;
    if (current.status !== "pending" && current.status !== "failed") {
      return fail(
        `This video is already "${current.status}" and cannot be approved again.`,
        409,
      );
    }
    if (!current.audio_url) {
      return fail("This video has no audio; it cannot be published.", 422);
    }

    const { data: updated, error: updateError } = await supabase
      .from("spiritual_videos")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", body.id)
      .select()
      .single();

    if (updateError) return fail(updateError.message, 500);

    // ---- hand off to the renderer ----
    if (!features.githubRenderer) {
      return ok({
        video: updated as SpiritualVideo,
        dispatched: false,
        message:
          "Approved. The GitHub Actions renderer is not configured, so nothing was dispatched — " +
          "set GITHUB_OWNER, GITHUB_REPO and GITHUB_DISPATCH_TOKEN, or render locally with `npm run render`.",
      });
    }

    if (!config.siteUrl) {
      return ok({
        video: updated as SpiritualVideo,
        dispatched: false,
        message:
          "Approved, but NEXT_PUBLIC_SITE_URL is not set, so the renderer would have nowhere to report back to. Set it and approve again.",
      });
    }

    try {
      await dispatchRender({
        video_id: body.id,
        callback_url: `${config.siteUrl}/api/publish/callback`,
      });
    } catch (error) {
      // The approval itself succeeded; surface the dispatch problem without
      // rolling the row back, so it can simply be approved again.
      await supabase
        .from("spiritual_videos")
        .update({ status: "failed", error_message: messageOf(error) })
        .eq("id", body.id);
      return fail(messageOf(error), 502, { video: updated });
    }

    return ok({
      video: updated as SpiritualVideo,
      dispatched: true,
      message: "Approved. Rendering and upload started on GitHub Actions.",
    });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
