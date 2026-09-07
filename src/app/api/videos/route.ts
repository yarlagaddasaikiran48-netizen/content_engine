import { fail, messageOf, ok } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { QueueStats, SpiritualVideo, VideoStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: VideoStatus[] = [
  "pending",
  "approved",
  "rendering",
  "published",
  "rejected",
  "failed",
];

/**
 * GET /api/videos?status=pending&limit=50
 *
 * The dashboard polls this. RLS blocks the anon key entirely, so reads happen
 * here with the service role rather than from the browser.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

    let query = supabaseAdmin()
      .from("spiritual_videos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusParam && statusParam !== "all") {
      const statuses = statusParam
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is VideoStatus =>
          VALID_STATUSES.includes(value as VideoStatus),
        );
      if (statuses.length === 0) {
        return fail(`Unknown status "${statusParam}".`, 400);
      }
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    if (error) return fail(error.message, 500);

    const { data: stats } = await supabaseAdmin()
      .from("queue_stats")
      .select("*")
      .maybeSingle();

    return ok({
      videos: (data ?? []) as SpiritualVideo[],
      stats: (stats ?? null) as QueueStats | null,
    });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
