import { fail, messageOf, ok } from "@/lib/api";
import { readQueue } from "@/lib/schedule/queue";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await readQueue());
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}

/**
 * POST /api/queue  { order: string[] }  — rewrite the publish order.
 * POST /api/queue  { id, action: "unqueue" } — send one back to the deck.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      order?: string[];
      id?: string;
      action?: string;
    };
    const supabase = supabaseAdmin();

    if (body.action === "unqueue" && body.id) {
      const cfg = await loadConfig();
      const { error } = await supabase
        .from("spiritual_videos")
        .update({
          status: "pending",
          approved_at: null,
          queue_position: null,
          // Back in the deck, it gets a fresh review window rather than
          // inheriting whatever was left of the old one.
          expires_at: new Date(Date.now() + cfg.rejectTtlHours * 3_600_000).toISOString(),
        })
        .eq("id", body.id)
        .eq("status", "approved");

      if (error) throw new Error(error.message);
      return ok({ unqueued: true });
    }

    if (Array.isArray(body.order)) {
      // Positions are rewritten wholesale. Sparse or duplicated positions are
      // what make a hand-maintained ordering drift, so it is always a full
      // rewrite rather than a swap.
      const updates = body.order.map((id, index) =>
        supabase.from("spiritual_videos").update({ queue_position: index }).eq("id", id),
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      return ok({ reordered: body.order.length });
    }

    return fail("Expected either an order array or an unqueue action.", 400);
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
