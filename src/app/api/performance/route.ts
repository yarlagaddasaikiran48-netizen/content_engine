import { fail, messageOf, ok } from "@/lib/api";
import {
  buildLearningBrief,
  hookLine,
  isMeasured,
  MIN_SAMPLE,
  score,
  type PerformedVideo,
} from "@/lib/learning/insights";
import { readPerformance } from "@/lib/learning/store";
import { loadConfig } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/performance
 *
 * Everything the Performance page shows, computed on the server so the phone
 * receives conclusions rather than a hundred rows to average in JavaScript.
 *
 * The channel-level totals are sums where summing is honest and means where it
 * is not. Views add up; retention does not — a video with four views and one
 * with four thousand would count equally in a plain average of percentages, so
 * the rate metrics are weighted by the audience they were measured over.
 */
export interface PerformanceRow {
  id: string;
  title: string;
  hook: string;
  publishedAt: string;
  youtubeUrl: string | null;
  deity: string | null;
  tone: string | null;
  views: number | null;
  engagedViews: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribersGained: number | null;
  hookRetention: number | null;
  completion: number | null;
  relativeRetention: number | null;
  score: number | null;
  measuredAt: string | null;
  error: string | null;
}

function weightedMean(
  videos: PerformedVideo[],
  value: (video: PerformedVideo) => number | null,
): number | null {
  let weighted = 0;
  let weight = 0;
  for (const video of videos) {
    const measurement = value(video);
    const audience = video.engaged_views ?? video.views ?? 0;
    if (measurement === null || audience <= 0) continue;
    weighted += measurement * audience;
    weight += audience;
  }
  return weight > 0 ? weighted / weight : null;
}

export async function GET() {
  try {
    const cfg = await loadConfig();

    let videos: PerformedVideo[] = [];
    let schemaError: string | null = null;
    try {
      videos = await readPerformance();
    } catch (error) {
      // Almost always migration 005 not yet run. Say so rather than 500.
      schemaError = messageOf(error);
    }

    const measured = videos.filter(isMeasured);

    const rows: PerformanceRow[] = videos.map((video) => ({
      id: video.id,
      title: video.title,
      hook: hookLine(video.script_body),
      publishedAt: video.published_at,
      youtubeUrl: video.youtube_url,
      deity: video.deity,
      tone: video.tone,
      views: video.views,
      engagedViews: video.engaged_views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      subscribersGained: video.subscribers_gained,
      hookRetention: video.retention_3s,
      completion: video.average_view_percentage,
      relativeRetention: video.relative_retention,
      score: score(video),
      measuredAt: video.stats_updated_at,
      error: (video as PerformedVideo & { stats_error?: string | null }).stats_error ?? null,
    }));

    const sum = (pick: (video: PerformedVideo) => number | null): number =>
      videos.reduce((total, video) => total + (pick(video) ?? 0), 0);

    return ok({
      published: videos.length,
      measured: measured.length,
      /** How many more measured videos before the engine will draw conclusions. */
      needsForLearning: Math.max(0, MIN_SAMPLE - measured.length),
      learningEnabled: cfg.learningEnabled,
      youtubeConnected: Boolean(cfg.youtubeRefreshToken),
      schemaError,
      totals: {
        views: sum((v) => v.views),
        engagedViews: sum((v) => v.engaged_views),
        likes: sum((v) => v.likes),
        comments: sum((v) => v.comments),
        shares: sum((v) => v.shares),
        subscribersGained: sum((v) => v.subscribers_gained),
        hookRetention: weightedMean(videos, (v) => v.retention_3s),
        completion: weightedMean(videos, (v) => v.average_view_percentage),
      },
      brief: buildLearningBrief(videos),
      rows,
    });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
