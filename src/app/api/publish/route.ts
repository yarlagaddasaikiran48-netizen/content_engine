import { fail, messageOf, ok } from "@/lib/api";
import { dispatchRender } from "@/lib/github/dispatch";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/publish  { id }
 *
 * The Post button. Hands an already-rendered, already-watched video to the
 * publish workflow, which uploads it and then archives and deletes the row.
 *
 * Only rows in "ready" are accepted. That is the only state in which a file
 * exists and nothing has been uploaded yet, so the check is also what stops a
 * double tap becoming two videos on the channel.
 */
export async function POST(request: Request) {
  try {
    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id) return fail("Missing video id.", 400);

    const cfg = await loadConfig();
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("spiritual_videos")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return fail(error.message, 500);
    if (!data) return fail("Video not found.", 404);

    const video = data as SpiritualVideo;

    if (video.status !== "ready") {
      return fail(
        `This video is "${video.status}". Only a rendered video that is ready to watch can be posted.`,
        409,
      );
    }
    if (!video.video_path) {
      return fail("This video has no rendered file. Render it again before posting.", 422);
    }
    if (!cfg.githubOwner || !cfg.githubRepo || !cfg.githubDispatchToken) {
      return fail("The GitHub renderer is not configured. Add it in Settings.", 422);
    }
    if (!cfg.siteUrl) {
      return fail("Set the Site URL in Settings so the job can report back.", 422);
    }

    await dispatchRender(
      { video_id: id, callback_url: `${cfg.siteUrl}/api/publish/callback` },
      "publish-video",
    );

    return ok({
      dispatched: true,
      message: "Uploading to YouTube. It will disappear from the queue once it is live.",
    });
  } catch (error) {
    return fail(messageOf(error), 502);
  }
}
