/**
 * Reading and writing the performance half of the archive.
 *
 * Kept apart from insights.ts on purpose: everything in there is pure, takes
 * rows and returns conclusions, and is therefore testable without a database.
 * Everything that knows about Supabase lives here.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PerformedVideo } from "@/lib/learning/insights";
import type { VideoStats } from "@/lib/youtube/analytics";

/** Every column insights.ts reads, named once so a rename cannot half-happen. */
const COLUMNS = `
  id, title, script_body, youtube_video_id, youtube_url, published_at,
  deity, tone, scripture, target_seconds, duration_seconds, word_count,
  views, engaged_views, likes, comments, shares, subscribers_gained,
  average_view_percentage, retention_3s, relative_retention,
  stats_updated_at, stats_error
`;

/**
 * How far back performance is worth refreshing.
 *
 * A Short does almost all of its work in the first fortnight. Past two months
 * the numbers have stopped moving, and re-reading them every tick spends quota
 * to learn nothing.
 */
export const REFRESH_WINDOW_DAYS = 60;

/**
 * How long a video's numbers are treated as current.
 *
 * Analytics lag reality by up to three days anyway, so asking more often than
 * this cannot produce a different answer.
 */
export const REFRESH_INTERVAL_HOURS = 6;

/** The published back catalogue, newest first, with whatever has been measured. */
export async function readPerformance(limit = 200): Promise<PerformedVideo[]> {
  const { data, error } = await supabaseAdmin()
    .from("published_archive")
    .select(COLUMNS)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not read performance: ${error.message}`);
  return (data ?? []) as unknown as PerformedVideo[];
}

/**
 * The next few videos whose numbers are stale, oldest refresh first.
 *
 * Never-refreshed rows sort ahead of everything (`nullsFirst`), so a video
 * published today is measured on the next tick rather than queueing behind the
 * whole back catalogue.
 */
export async function videosNeedingStats(limit = 3): Promise<PerformedVideo[]> {
  const publishedSince = new Date(
    Date.now() - REFRESH_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const staleBefore = new Date(
    Date.now() - REFRESH_INTERVAL_HOURS * 3_600_000,
  ).toISOString();

  const { data, error } = await supabaseAdmin()
    .from("published_archive")
    .select(COLUMNS)
    .not("youtube_video_id", "is", null)
    .gte("published_at", publishedSince)
    .or(`stats_updated_at.is.null,stats_updated_at.lt.${staleBefore}`)
    .order("stats_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`Could not list videos needing stats: ${error.message}`);
  return (data ?? []) as unknown as PerformedVideo[];
}

/**
 * Store what came back.
 *
 * `stats_error` is cleared on success. A video that failed once because
 * YouTube had not finished processing it should not carry that explanation
 * around forever once the numbers arrive.
 */
export async function saveStats(id: string, stats: VideoStats): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("published_archive")
    .update({
      views: stats.views,
      engaged_views: stats.engagedViews,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      subscribers_gained: stats.subscribersGained,
      subscribers_lost: stats.subscribersLost,
      estimated_minutes_watched: stats.estimatedMinutesWatched,
      average_view_duration: stats.averageViewDuration,
      average_view_percentage: stats.averageViewPercentage,
      retention_3s: stats.retention3s,
      relative_retention: stats.relativeRetention,
      stats_updated_at: new Date().toISOString(),
      stats_error: null,
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save stats: ${error.message}`);
}

/**
 * Record why a video has no numbers.
 *
 * `stats_updated_at` is stamped even on failure, which looks wrong and is not:
 * without it a permanently unreadable video -- deleted from YouTube, say --
 * stays at the front of the stale queue forever and every tick retries it
 * instead of measuring anything else.
 */
export async function saveStatsError(id: string, message: string): Promise<void> {
  await supabaseAdmin()
    .from("published_archive")
    .update({
      stats_error: message.slice(0, 500),
      stats_updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
