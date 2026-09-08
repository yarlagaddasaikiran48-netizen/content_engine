import { fail, messageOf, ok } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { dispatchRender } from "@/lib/github/dispatch";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/approve  { id }
 *
 * Marks the row approved and hands it to the GitHub Actions renderer, which
 * records the narration, builds the MP4, and reports back. The status flow
 * from here is approved -> rendering -> ready, and publishing is a separate
 * decision made afterwards from the Queue.
 */
export async function POST(request: Request) {
  try {
    const config = await loadConfig();
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
    // There is deliberately no audio check here any more, and its absence is
    // load-bearing. This route used to require audio_url, which was correct
    // when the narration was recorded at generation time. It is not recorded
    // then any more -- the speech budget is ten requests a day against twenty
    // for text, so recording every script meant spending the scarcer budget on
    // the six scripts out of seven that get rejected on sight. The renderer
    // records it after approval, for the one script that is going to become a
    // video.
    //
    // The gate was not removed with the rest of that change, so every freshly
    // generated row -- which by construction has no audio -- was refused with
    // "This video has no audio; it cannot be published." Approve was the first
    // transition in the pipeline, so nothing could reach the queue at all.

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
    const hasRenderer = Boolean(config.githubOwner && config.githubRepo && config.githubDispatchToken);
    if (!hasRenderer) {
      return ok({
        video: updated as SpiritualVideo,
        dispatched: false,
        message:
          "Approved. The GitHub Actions renderer is not configured, so nothing was dispatched — " +
          "add the GitHub owner, repo and dispatch token in Settings, or render locally with `npm run render`.",
      });
    }

    if (!config.siteUrl) {
      return ok({
        video: updated as SpiritualVideo,
        dispatched: false,
        message:
          "Approved, but the Site URL is not set in Settings, so the renderer would have nowhere to report back to. Set it and approve again.",
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
