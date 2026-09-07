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
      .select("id, status, audio_path")
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
        // A reject is a deferral, not a deletion. The card keeps cycling
        // through the deck until this moment, then the scheduler removes it
        // and hands its scripture verse back to the pool.
        expires_at: new Date(Date.now() + cfg.rejectTtlHours * 3_600_000).toISOString(),
      })
      .eq("id", body.id)
      .select()
      .single();

    if (error) return fail(error.message, 500);

    return ok({ video: updated as SpiritualVideo });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
