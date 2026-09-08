/**
 * YouTube Analytics API v2 — what a published video actually did.
 *
 * Two reports per video, because they answer two different questions:
 *
 *   basic stats     — how many people, how long, what they did about it.
 *   audience retention — where the ones who left, left.
 *
 * The second is the interesting one. It is dimensioned by
 * `elapsedVideoTimeRatio`, a 0–1 position through the video, and reports
 * `audienceWatchRatio` at each step: the share of viewers still watching
 * there. Sampled near the three-second mark it is a direct measurement of the
 * opening line, which is the only part of a script the engine can change
 * deliberately and then re-measure.
 *
 * Written against fetch rather than `googleapis` for the same reason upload.ts
 * is: the package is ~100 MB installed to make two HTTP calls, and Vercel's
 * serverless bundle budget is not that generous.
 *
 * WHAT MAKES THIS 403, WHICH IS THE ONLY FAILURE WORTH PLANNING FOR:
 *
 *   - The YouTube Analytics API is a separate product from the Data API and is
 *     enabled separately in Google Cloud. Uploading works, so the connection
 *     looks healthy, and every call here still fails.
 *   - `yt-analytics.readonly` has been in YOUTUBE_SCOPES since the Connect
 *     button existed, so a normal connection carries it -- but a token minted
 *     against a consent screen that did not list the scope will not, and no
 *     amount of retrying fixes that either.
 *
 * Neither is fixable server-side, so both are detected and reported as an
 * instruction rather than as a stack trace.
 */

import { getAccessToken } from "@/lib/youtube/oauth";

const REPORTS_ENDPOINT = "https://youtubeanalytics.googleapis.com/v2/reports";

/**
 * Where in the video the hook is judged.
 *
 * Three seconds is not arbitrary: it is where roughly half of everyone who
 * abandons a Short has already gone. Expressed as a fraction of the runtime,
 * because that is the unit the retention report is dimensioned in.
 */
export const HOOK_SECONDS = 3;

/** What one video did. Every field is optional — a fresh upload has almost none. */
export interface VideoStats {
  views: number | null;
  engagedViews: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
  estimatedMinutesWatched: number | null;
  averageViewDuration: number | null;
  averageViewPercentage: number | null;
  /** audienceWatchRatio sampled at ~3 seconds. The hook score. */
  retention3s: number | null;
  /** How it held viewers against other YouTube videos of a similar length. */
  relativeRetention: number | null;
}

const EMPTY: VideoStats = {
  views: null,
  engagedViews: null,
  likes: null,
  comments: null,
  shares: null,
  subscribersGained: null,
  subscribersLost: null,
  estimatedMinutesWatched: null,
  averageViewDuration: null,
  averageViewPercentage: null,
  retention3s: null,
  relativeRetention: null,
};

interface ReportResponse {
  columnHeaders?: Array<{ name: string }>;
  /** Cells are numbers in practice, but the shape permits null and must survive it. */
  rows?: Array<Array<string | number | null>>;
}

/**
 * Thrown when the connected account cannot answer analytics questions at all,
 * as opposed to a single video having no data yet. The caller stores the
 * message so the Performance page can tell the operator what to press rather
 * than showing an empty table forever.
 */
export class AnalyticsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsUnavailable";
  }
}

/** `YYYY-MM-DD` in UTC, which is the only date format the API accepts. */
export function apiDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The window a report covers.
 *
 * Starts the day before publication rather than on it. Publication time is
 * stored as an instant and the API works in whole days in the channel's own
 * timezone, so a video posted at 00:05 IST belongs to the previous UTC day and
 * a same-day start silently loses its first hours. A day of slack costs
 * nothing -- there are no views before the video exists.
 */
export function reportWindow(publishedAt: Date, now: Date = new Date()) {
  const start = new Date(publishedAt.getTime() - 86_400_000);
  // A day of slack at the far end too: analytics lag real time by up to ~72
  // hours, and asking for tomorrow is not an error, merely empty.
  const end = new Date(now.getTime() + 86_400_000);
  return { startDate: apiDate(start), endDate: apiDate(end) };
}

async function query(
  params: Record<string, string>,
  token: string,
): Promise<ReportResponse> {
  const url = `${REPORTS_ENDPOINT}?${new URLSearchParams({
    ids: "channel==MINE",
    ...params,
  })}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await response.text();

  if (response.status === 403) {
    throw new AnalyticsUnavailable(
      "YouTube refused the analytics request (403). Two things cause this, in " +
        "this order of likelihood: the YouTube Analytics API is not enabled on " +
        "the Google Cloud project (enable it under APIs & Services -> Library), " +
        "or the stored connection predates analytics access, in which case press " +
        "Connect YouTube in Settings to re-consent. " +
        `Google said: ${text.slice(0, 300)}`,
    );
  }
  if (response.status === 401) {
    throw new AnalyticsUnavailable(
      "YouTube rejected the stored credentials (401). Open Settings and press " +
        "Connect YouTube again.",
    );
  }
  if (!response.ok) {
    throw new Error(`YouTube Analytics HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  return JSON.parse(text) as ReportResponse;
}

/**
 * One cell as a number, or null when it does not hold one.
 *
 * `Number(null)` is 0, and 0 is finite. Coercing first and testing afterwards
 * therefore turns a cell YouTube explicitly declined to fill into a real,
 * averageable zero -- the exact "missing must never read as none" failure the
 * rest of this module exists to avoid. Null and empty are rejected before any
 * coercion happens, not after.
 */
function numericCell(cell: string | number | null | undefined): number | null {
  if (cell === null || cell === undefined || cell === "") return null;
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
}

/**
 * Turn a one-row report into a lookup by column name.
 *
 * The API returns columns in the order requested and rows as bare arrays, so
 * reading by index works right up until someone reorders the metrics string.
 * Reading by header name does not have that failure mode.
 */
function firstRowByName(report: ReportResponse): Map<string, number> {
  const out = new Map<string, number>();
  const headers = report.columnHeaders ?? [];
  const row = report.rows?.[0];
  if (!row) return out;

  headers.forEach((header, index) => {
    const value = numericCell(row[index]);
    if (value !== null) out.set(header.name, value);
  });
  return out;
}

const BASIC_METRICS = [
  "views",
  "engagedViews",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
].join(",");

/**
 * Read the retention curve at the hook.
 *
 * `elapsedVideoTimeRatio` steps in hundredths, so the bucket to read depends
 * on how long the video is: three seconds into a 30-second Short is 0.10, and
 * into a 60-second one it is 0.05. Without the duration there is no way to
 * convert, so this returns nulls rather than guessing — a guess here would
 * silently compare the first three seconds of one video against the first six
 * of another and call the difference a hook.
 */
function readHookRetention(
  report: ReportResponse,
  durationSeconds: number | null,
): { retention3s: number | null; relativeRetention: number | null } {
  const headers = report.columnHeaders ?? [];
  const rows = report.rows ?? [];
  if (rows.length === 0) return { retention3s: null, relativeRetention: null };

  const ratioIndex = headers.findIndex((h) => h.name === "elapsedVideoTimeRatio");
  const watchIndex = headers.findIndex((h) => h.name === "audienceWatchRatio");
  const relativeIndex = headers.findIndex((h) => h.name === "relativeRetentionPerformance");

  // relativeRetentionPerformance is flat across the curve, so any row has it.
  const relativeRetention =
    relativeIndex >= 0 ? numericCell(rows[0][relativeIndex]) : null;

  if (ratioIndex < 0 || watchIndex < 0 || !durationSeconds || durationSeconds <= 0) {
    return { retention3s: null, relativeRetention };
  }

  const target = Math.min(1, HOOK_SECONDS / durationSeconds);

  let best: { distance: number; value: number } | null = null;
  for (const row of rows) {
    const ratio = numericCell(row[ratioIndex]);
    const watch = numericCell(row[watchIndex]);
    if (ratio === null || watch === null) continue;
    const distance = Math.abs(ratio - target);
    if (!best || distance < best.distance) best = { distance, value: watch };
  }

  return { retention3s: best ? best.value : null, relativeRetention };
}

export interface FetchStatsInput {
  youtubeVideoId: string;
  publishedAt: Date;
  /** Needed to convert three seconds into a position on the retention curve. */
  durationSeconds: number | null;
  now?: Date;
}

/**
 * Everything worth knowing about one published video.
 *
 * The retention half is allowed to fail on its own. YouTube withholds the
 * curve until a video has enough views to anonymise it, which for a new
 * channel is most of them — and a missing curve is no reason to throw away
 * view counts that arrived fine.
 */
export async function fetchVideoStats(input: FetchStatsInput): Promise<VideoStats> {
  const token = await getAccessToken();
  const { startDate, endDate } = reportWindow(input.publishedAt, input.now);
  const filters = `video==${input.youtubeVideoId}`;

  const basic = await query(
    { startDate, endDate, metrics: BASIC_METRICS, filters },
    token,
  );
  const values = firstRowByName(basic);

  let retention3s: number | null = null;
  let relativeRetention: number | null = null;
  try {
    const curve = await query(
      {
        startDate,
        endDate,
        metrics: "audienceWatchRatio,relativeRetentionPerformance",
        dimensions: "elapsedVideoTimeRatio",
        filters,
      },
      token,
    );
    ({ retention3s, relativeRetention } = readHookRetention(curve, input.durationSeconds));
  } catch (error) {
    // A 403 on the curve alone is still an unavailability worth surfacing; a
    // plain failure is not, because the numbers above it came back.
    if (error instanceof AnalyticsUnavailable) throw error;
  }

  const read = (name: string): number | null =>
    values.has(name) ? (values.get(name) as number) : null;

  return {
    ...EMPTY,
    views: read("views"),
    engagedViews: read("engagedViews"),
    likes: read("likes"),
    comments: read("comments"),
    shares: read("shares"),
    subscribersGained: read("subscribersGained"),
    subscribersLost: read("subscribersLost"),
    estimatedMinutesWatched: read("estimatedMinutesWatched"),
    averageViewDuration: read("averageViewDuration"),
    averageViewPercentage: read("averageViewPercentage"),
    retention3s,
    relativeRetention,
  };
}
