import { fail, messageOf, ok } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reject  { id, reason? }
 *
 * The topic stays spent on purpose. A rejected angle should not come back
 * around later — that is exactly the repetition the ledger exists to prevent.
 */
export async function POST(request: Request) {
  try {
    const cfg = await loadConfig();
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      reason?: string;
    };
    if (!body.id) return fail("Missing video id.", 400);

    const supabase = supabaseAdmin();

    const { data: video } = await supabase
      .from("spiritual_videos")
      .select("id, status, audio_path, topic_key")
      .eq("id", body.id)
      .maybeSingle();

    if (!video) return fail("Video not found.", 404);
    if (video.status === "published") {
      return fail("This video is already live on YouTube and cannot be rejected.", 409);
    }

    const { data: updated, error } = await supabase
      .from("spiritual_videos")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: body.reason?.slice(0, 500) ?? null,
        // Not a deferral -- the card is gone from the deck the moment this
        // write lands. This timestamp is only when the ROW is deleted, and it
        // is deliberately later than the reject: the body stays in the
        // similarity corpus in the meantime, so the next few generations are
        // measured against the script you turned down.
        expires_at: new Date(Date.now() + cfg.rejectTtlHours * 3_600_000).toISOString(),
      })
      .eq("id", body.id)
      .select()
      .single();

    if (error) return fail(error.message, 500);

    // Burn the verse, again. It was already spent when the script was written,
    // but that happens in a separate call after the insert -- if it failed, or
    // the function timed out between the two, the verse is still sitting in
    // the pool waiting to be written up a second time. consume_topic only
    // increments a counter the pool query compares against zero, so running it
    // twice costs nothing and closes that window for good.
    if ((video as { topic_key?: string | null }).topic_key) {
      await supabase.rpc("consume_topic", {
        p_topic_key: (video as { topic_key: string }).topic_key,
      });
    }

    return ok({ video: updated as SpiritualVideo });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
