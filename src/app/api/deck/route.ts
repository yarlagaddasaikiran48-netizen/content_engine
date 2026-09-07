import { fail, messageOf, ok } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/deck
 *
 * The swipe deck: everything still awaiting a decision.
 *
 * Order is unseen first, then rejected-but-not-yet-expired. That is the
 * operator's own rule — a reject is a deferral for twenty-four hours, not a
 * deletion — and putting recycled cards behind fresh ones means a change of
 * mind is possible without the same card blocking the top of the pile.
 */
export async function GET() {
  try {
    const cfg = await loadConfig();
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("spiritual_videos")
      .select("*")
      .in("status", ["pending", "rejected"])
      .order("status", { ascending: true }) // 'pending' sorts before 'rejected'
      .order("seen_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(60);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as SpiritualVideo[];
    const now = Date.now();

    // Expired cards are filtered here as well as swept by the scheduler, so a
    // stale card never appears just because the tick has not run yet.
    const live = rows.filter(
      (row) => !row.expires_at || new Date(row.expires_at).getTime() > now,
    );

    const { count: approved } = await supabase
      .from("spiritual_videos")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");

    return ok({
      videos: live,
      approvedWaiting: approved ?? 0,
      targetSeconds: cfg.targetSeconds,
      scriptsPerDay: cfg.scriptsPerDay,
      videosPerDay: cfg.videosPerDay,
    });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}

/**
 * POST /api/deck  { id }
 *
 * Stamps a card as seen. Called when it first reaches the top, so the next
 * session can put genuinely new material in front of the operator.
 */
export async function POST(request: Request) {
  try {
    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id) return fail("Missing video id.", 400);

    const { error } = await supabaseAdmin()
      .from("spiritual_videos")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", id)
      .is("seen_at", null);

    if (error) throw new Error(error.message);
    return ok({ seen: true });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
