import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PerformedVideo } from "@/lib/learning/insights";

/**
 * The channel-level numbers this route hands the phone are the whole point of
 * it: the page shows conclusions, not a hundred rows to average in JavaScript.
 * So the arithmetic is what these tests guard — that a rate is weighted by the
 * audience it was measured over, that a video nobody watched cannot drag a
 * mean anywhere or turn it into NaN, and that a missing migration comes back
 * as a sentence rather than a 500.
 */

let rows: PerformedVideo[] = [];
let readError: Error | null = null;
let config: Record<string, unknown> = {};

vi.mock("@/lib/learning/store", () => ({
  readPerformance: async () => {
    if (readError) throw readError;
    return rows;
  },
}));

vi.mock("@/lib/settings/config", () => ({
  loadConfig: async () => config,
}));

const { GET } = await import("@/app/api/performance/route");

let seq = 0;

/** One published row with everything unmeasured, so each test names only what it means. */
function video(over: Partial<PerformedVideo> = {}): PerformedVideo {
  seq += 1;
  return {
    id: `v${seq}`,
    title: `Episode ${seq}`,
    script_body: "Yama's noose fell. The boy held on.",
    youtube_video_id: null,
    youtube_url: null,
    published_at: "2026-09-01T00:00:00.000Z",
    deity: null,
    tone: null,
    scripture: null,
    target_seconds: null,
    duration_seconds: null,
    word_count: null,
    views: null,
    engaged_views: null,
    likes: null,
    comments: null,
    shares: null,
    subscribers_gained: null,
    average_view_percentage: null,
    retention_3s: null,
    relative_retention: null,
    stats_updated_at: null,
    ...over,
  };
}

/** A row YouTube has actually reported on, which is what MIN_SAMPLE counts. */
function measured(over: Partial<PerformedVideo> = {}): PerformedVideo {
  return video({
    stats_updated_at: "2026-09-05T00:00:00.000Z",
    engaged_views: 100,
    retention_3s: 0.5,
    average_view_percentage: 50,
    ...over,
  });
}

async function body() {
  const response = await GET();
  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  rows = [];
  readError = null;
  config = { learningEnabled: true, youtubeRefreshToken: "" };
});

describe("GET /api/performance totals", () => {
  it("weights retention by the audience it was measured over, not by the video", async () => {
    // A plain average of 20% and 80% is 50%, which would let ten viewers
    // outvote a thousand. The honest answer is nearly the big video's number.
    rows = [
      measured({ engaged_views: 10, retention_3s: 0.2 }),
      measured({ engaged_views: 1000, retention_3s: 0.8 }),
    ];

    const { json } = await body();

    expect(json.totals.hookRetention).toBeCloseTo((0.2 * 10 + 0.8 * 1000) / 1010, 6);
    expect(json.totals.hookRetention).toBeGreaterThan(0.75);
    expect(json.totals.hookRetention).not.toBeCloseTo(0.5, 2);
  });

  it("weights completion the same way", async () => {
    rows = [
      measured({ engaged_views: 10, average_view_percentage: 20 }),
      measured({ engaged_views: 1000, average_view_percentage: 80 }),
    ];

    const { json } = await body();

    expect(json.totals.completion).toBeCloseTo((20 * 10 + 80 * 1000) / 1010, 6);
  });

  it("falls back to plain views when a row has no engaged_views to weight by", async () => {
    rows = [
      measured({ engaged_views: null, views: 10, retention_3s: 0.2 }),
      measured({ engaged_views: null, views: 1000, retention_3s: 0.8 }),
    ];

    const { json } = await body();

    expect(json.totals.hookRetention).toBeCloseTo((0.2 * 10 + 0.8 * 1000) / 1010, 6);
  });

  it("lets a video nobody watched contribute nothing to the means", async () => {
    rows = [
      measured({ engaged_views: 0, views: 0, retention_3s: 0.99 }),
      measured({ engaged_views: null, views: null, retention_3s: 0.01 }),
      measured({ engaged_views: 400, retention_3s: 0.6 }),
    ];

    const { json } = await body();

    // Exactly the one measurable video's number: the other two are weightless.
    expect(json.totals.hookRetention).toBe(0.6);
    expect(Number.isNaN(json.totals.hookRetention)).toBe(false);
  });

  it("returns null rather than NaN when nothing has an audience at all", async () => {
    rows = [
      measured({ engaged_views: 0, views: 0, retention_3s: 0.99 }),
      measured({ engaged_views: null, views: null, average_view_percentage: 70 }),
    ];

    const { json } = await body();

    expect(json.totals.hookRetention).toBeNull();
    expect(json.totals.completion).toBeNull();
  });

  it("sums the counts, treating a null as a zero rather than poisoning the sum", async () => {
    rows = [
      video({
        views: 100,
        engaged_views: 40,
        likes: 5,
        comments: 2,
        shares: 1,
        subscribers_gained: 3,
      }),
      video({
        views: null,
        engaged_views: null,
        likes: null,
        comments: null,
        shares: null,
        subscribers_gained: null,
      }),
      video({
        views: 250,
        engaged_views: 60,
        likes: 7,
        comments: null,
        shares: 4,
        subscribers_gained: null,
      }),
    ];

    const { json } = await body();

    expect(json.totals).toMatchObject({
      views: 350,
      engagedViews: 100,
      likes: 12,
      comments: 2,
      shares: 5,
      subscribersGained: 3,
    });
  });

  it("sums to zero rather than null on an empty channel", async () => {
    const { json } = await body();

    expect(json.totals.views).toBe(0);
    expect(json.published).toBe(0);
    expect(json.measured).toBe(0);
  });
});

describe("GET /api/performance sample size", () => {
  it("counts down from MIN_SAMPLE as measured videos arrive", async () => {
    expect((await body()).json.needsForLearning).toBe(6);

    rows = [measured(), measured()];
    expect((await body()).json.needsForLearning).toBe(4);

    rows = [measured(), measured(), measured(), measured(), measured()];
    expect((await body()).json.needsForLearning).toBe(1);
  });

  it("does not count a published video that YouTube has not reported on yet", async () => {
    rows = [video(), video(), measured()];

    const { json } = await body();

    expect(json.published).toBe(3);
    expect(json.measured).toBe(1);
    expect(json.needsForLearning).toBe(5);
  });

  it("floors at zero instead of going negative once the channel is past the bar", async () => {
    rows = Array.from({ length: 9 }, () => measured());

    const { json } = await body();

    expect(json.measured).toBe(9);
    expect(json.needsForLearning).toBe(0);
  });
});

describe("GET /api/performance degraded schema", () => {
  it("answers 200 with a readable schemaError when the performance columns are missing", async () => {
    readError = new Error(
      "Could not read performance: column published_archive.engaged_views does not exist",
    );

    const { status, json } = await body();

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.schemaError).toMatch(/engaged_views does not exist/);
    expect(json.rows).toEqual([]);
    expect(json.published).toBe(0);
    expect(json.totals.views).toBe(0);
    expect(json.totals.hookRetention).toBeNull();
  });

  it("leaves schemaError null when the read succeeds", async () => {
    rows = [measured()];

    const { json } = await body();

    expect(json.schemaError).toBeNull();
  });
});

describe("GET /api/performance connection flags", () => {
  it("reports youtubeConnected only when a refresh token is stored", async () => {
    expect((await body()).json.youtubeConnected).toBe(false);

    config = { learningEnabled: true, youtubeRefreshToken: "1//refresh-token" };
    expect((await body()).json.youtubeConnected).toBe(true);
  });

  it("passes the learning switch straight through", async () => {
    config = { learningEnabled: false, youtubeRefreshToken: "" };

    expect((await body()).json.learningEnabled).toBe(false);
  });
});

describe("GET /api/performance rows", () => {
  it("carries the opening line of each script as its hook", async () => {
    rows = [
      video({ script_body: "Yama's noose fell. The boy held on to the stone." }),
      video({ script_body: "  Why did the god of death stop?  And who stopped him?  " }),
    ];

    const { json } = await body();

    expect(json.rows[0].hook).toBe("Yama's noose fell.");
    expect(json.rows[1].hook).toBe("Why did the god of death stop?");
  });

  it("renames the database columns into the shape the page reads", async () => {
    rows = [
      measured({
        id: "row-1",
        title: "When death came for Markandeya",
        youtube_url: "https://youtu.be/abc",
        deity: "Shiva",
        tone: "intense",
        engaged_views: 400,
        subscribers_gained: 9,
        retention_3s: 0.71,
        average_view_percentage: 63,
        relative_retention: 1.2,
      }),
    ];

    const { json } = await body();

    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toMatchObject({
      id: "row-1",
      title: "When death came for Markandeya",
      youtubeUrl: "https://youtu.be/abc",
      deity: "Shiva",
      tone: "intense",
      engagedViews: 400,
      subscribersGained: 9,
      hookRetention: 0.71,
      completion: 63,
      relativeRetention: 1.2,
      measuredAt: "2026-09-05T00:00:00.000Z",
      error: null,
    });
    expect(json.rows[0].score).toBeGreaterThan(0);
  });

  it("surfaces a per-video stats_error rather than hiding it", async () => {
    rows = [{ ...video(), stats_error: "quotaExceeded" } as PerformedVideo];

    const { json } = await body();

    expect(json.rows[0].error).toBe("quotaExceeded");
  });
});
