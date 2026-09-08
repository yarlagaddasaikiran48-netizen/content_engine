import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The token is not the seam under test — every call here assumes a connected
 * account, so the refresh is stood in for and the assertions are all about what
 * the two reports say and how they are read.
 */
vi.mock("@/lib/youtube/oauth", () => ({
  getAccessToken: async () => "fake-access-token",
}));

const { AnalyticsUnavailable, HOOK_SECONDS, apiDate, fetchVideoStats, reportWindow } =
  await import("@/lib/youtube/analytics");

/** The metrics string analytics.ts asks for, in the order it asks for them. */
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
];

type Reply = { status?: number; body?: unknown; text?: string };

function httpReply({ status = 200, body, text }: Reply): Response {
  const payload = text ?? JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => payload,
  } as unknown as Response;
}

/** True for the audience-retention call, which is the only one with dimensions. */
function isRetentionCall(url: string): boolean {
  return url.includes("dimensions=elapsedVideoTimeRatio");
}

/**
 * Answer the two reports independently, so a test can break one and leave the
 * other intact. Returns the mock for URL assertions.
 */
function stubFetch(replies: { basic: Reply; retention?: Reply }) {
  const fetchMock = vi.fn(async (url: string) =>
    httpReply(isRetentionCall(url) ? (replies.retention ?? { body: {} }) : replies.basic),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A 200 carrying a one-row report whose columns are declared in `headers` order. */
function basicReport(headers: string[], values: Array<number | string>): Reply {
  return { body: { columnHeaders: headers.map((name) => ({ name })), rows: [values] } };
}

const INPUT = {
  youtubeVideoId: "vid123",
  publishedAt: new Date("2026-03-10T06:00:00Z"),
  durationSeconds: 30,
  now: new Date("2026-03-12T06:00:00Z"),
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiDate", () => {
  it("formats YYYY-MM-DD", () => {
    expect(apiDate(new Date("2026-03-09T12:00:00Z"))).toBe("2026-03-09");
  });

  it("reads the date in UTC, not in whatever timezone the server sits in", () => {
    // 20:00 UTC is already the next day in IST. The API works in UTC days and
    // a local-time read would silently ask for the wrong window.
    expect(apiDate(new Date("2026-01-01T20:00:00Z"))).toBe("2026-01-01");
    // ...and the far side: 00:30 UTC is still the previous evening in New York.
    expect(apiDate(new Date("2026-01-02T00:30:00Z"))).toBe("2026-01-02");
  });

  it("keeps the leading zeroes a bare number would drop", () => {
    expect(apiDate(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("reportWindow", () => {
  it("starts the day before publication, not on it", () => {
    // A video posted at 00:05 IST belongs to the previous UTC day; starting on
    // the publication date loses its first hours.
    const published = new Date("2026-03-10T00:05:00+05:30"); // 2026-03-09T18:35Z
    const { startDate } = reportWindow(published, new Date("2026-03-12T00:00:00Z"));
    expect(startDate).toBe("2026-03-08");
  });

  it("ends the day after now, because analytics lag real time", () => {
    const { endDate } = reportWindow(
      new Date("2026-03-10T06:00:00Z"),
      new Date("2026-03-12T06:00:00Z"),
    );
    expect(endDate).toBe("2026-03-13");
  });

  it("crosses month and year boundaries by date arithmetic, not string surgery", () => {
    expect(reportWindow(new Date("2026-01-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z")))
      .toEqual({ startDate: "2025-12-31", endDate: "2027-01-01" });
  });

  it("defaults the far end to the present when no clock is passed", () => {
    const { endDate } = reportWindow(new Date("2026-03-10T06:00:00Z"));
    const expected = apiDate(new Date(Date.now() + 86_400_000));
    expect(endDate).toBe(expected);
  });
});

describe("fetchVideoStats — basic stats", () => {
  it("reads values by column name, not by position in the metrics string", async () => {
    // The API returns columns in the order requested — right up until someone
    // reorders BASIC_METRICS. Declare the headers backwards and the values must
    // still land in the right fields.
    const headers = [...BASIC_METRICS].reverse();
    const byName: Record<string, number> = {
      views: 1_000,
      engagedViews: 900,
      likes: 80,
      comments: 7,
      shares: 6,
      subscribersGained: 5,
      subscribersLost: 1,
      estimatedMinutesWatched: 42,
      averageViewDuration: 21,
      averageViewPercentage: 70,
    };
    stubFetch({ basic: basicReport(headers, headers.map((h) => byName[h])) });

    const stats = await fetchVideoStats(INPUT);

    expect(stats).toMatchObject(byName);
  });

  it("carries a genuine zero through as zero", async () => {
    stubFetch({ basic: basicReport(BASIC_METRICS, BASIC_METRICS.map(() => 0)) });

    const stats = await fetchVideoStats(INPUT);

    expect(stats.views).toBe(0);
    expect(stats.likes).toBe(0);
  });

  it("returns null, never 0, for a metric the report did not include", async () => {
    // Zero views and unknown views are different facts; collapsing them makes
    // the Performance page lie about a video whose numbers have not landed.
    stubFetch({ basic: basicReport(["views", "likes"], [12, 3]) });

    const stats = await fetchVideoStats(INPUT);

    expect(stats.views).toBe(12);
    expect(stats.likes).toBe(3);
    expect(stats.comments).toBeNull();
    expect(stats.shares).toBeNull();
    expect(stats.subscribersGained).toBeNull();
    expect(stats.subscribersLost).toBeNull();
    expect(stats.estimatedMinutesWatched).toBeNull();
    expect(stats.averageViewDuration).toBeNull();
    expect(stats.averageViewPercentage).toBeNull();
    expect(stats.engagedViews).toBeNull();
  });

  it("returns every field null for a fresh upload with no rows at all", async () => {
    stubFetch({ basic: { body: { columnHeaders: BASIC_METRICS.map((name) => ({ name })) } } });

    const stats = await fetchVideoStats(INPUT);

    expect(Object.values(stats).every((v) => v === null)).toBe(true);
  });

  it("asks for the one video, over the slack window, with the stored token", async () => {
    const fetchMock = stubFetch({ basic: basicReport(["views"], [1]) });

    await fetchVideoStats(INPUT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("ids=channel%3D%3DMINE");
    expect(url).toContain("filters=video%3D%3Dvid123");
    expect(url).toContain("startDate=2026-03-09");
    expect(url).toContain("endDate=2026-03-13");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer fake-access-token",
    );
  });
});

describe("fetchVideoStats — the hook", () => {
  /** One curve, sampled in hundredths, with a distinct watch ratio per step. */
  const CURVE = {
    columnHeaders: [
      { name: "elapsedVideoTimeRatio" },
      { name: "audienceWatchRatio" },
      { name: "relativeRetentionPerformance" },
    ],
    rows: [
      [0, 1.0, 0.62],
      [0.04, 0.95, 0.62],
      [0.05, 0.91, 0.62],
      [0.1, 0.77, 0.62],
      [0.2, 0.55, 0.62],
      [0.5, 0.3, 0.62],
    ],
  };

  it("samples 3s into a 30-second Short at ratio 0.10", async () => {
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: CURVE } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: 30 });

    expect(HOOK_SECONDS / 30).toBeCloseTo(0.1);
    expect(stats.retention3s).toBe(0.77);
  });

  it("samples the same curve at 0.05 for a 60-second one", async () => {
    // Same rows, different answer: the bucket is a fraction of the runtime, so
    // duration is what decides which row is the hook.
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: CURVE } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: 60 });

    expect(stats.retention3s).toBe(0.91);
  });

  it("picks the nearest row when the exact ratio is not sampled", async () => {
    const sparse = {
      columnHeaders: [{ name: "elapsedVideoTimeRatio" }, { name: "audienceWatchRatio" }],
      rows: [
        [0, 1.0],
        [0.08, 0.8],
        [0.3, 0.4],
      ],
    };
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: sparse } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: 30 });

    expect(stats.retention3s).toBe(0.8);
  });

  it("clamps to the end of the curve for a video shorter than the hook", async () => {
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: CURVE } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: 2 });

    // target is min(1, 3/2) = 1, so the last sampled row wins.
    expect(stats.retention3s).toBe(0.3);
  });

  it("refuses to guess the bucket when the duration is unknown", async () => {
    // Guessing would compare the first three seconds of one video against the
    // first six of another and call the difference a hook.
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: CURVE } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: null });

    expect(stats.retention3s).toBeNull();
  });

  it("still reads relativeRetention when the hook cannot be computed", async () => {
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: CURVE } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: null });

    expect(stats.retention3s).toBeNull();
    expect(stats.relativeRetention).toBe(0.62);
  });

  it("reads relativeRetention alongside a computed hook too", async () => {
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: CURVE } });

    const stats = await fetchVideoStats({ ...INPUT, durationSeconds: 30 });

    expect(stats.relativeRetention).toBe(0.62);
    expect(stats.retention3s).toBe(0.77);
  });

  it("returns nulls when YouTube withholds the curve entirely", async () => {
    // Withheld until a video has enough views to anonymise it, which for a new
    // channel is most of them.
    stubFetch({ basic: basicReport(["views"], [10]), retention: { body: { rows: [] } } });

    const stats = await fetchVideoStats(INPUT);

    expect(stats.retention3s).toBeNull();
    expect(stats.relativeRetention).toBeNull();
    expect(stats.views).toBe(10);
  });

  it("asks for the curve dimensioned by elapsed time ratio", async () => {
    const fetchMock = stubFetch({
      basic: basicReport(["views"], [10]),
      retention: { body: CURVE },
    });

    await fetchVideoStats(INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toContain("dimensions=elapsedVideoTimeRatio");
    expect(url).toContain("audienceWatchRatio");
    expect(url).toContain("relativeRetentionPerformance");
  });
});

describe("fetchVideoStats — failures", () => {
  it("tells the operator to press Connect YouTube when the basic report 403s", async () => {
    // A token minted before yt-analytics.readonly was asked for cannot be
    // repaired server-side, so the message has to name the button.
    stubFetch({ basic: { status: 403, text: '{"error":"insufficient scope"}' } });

    await expect(fetchVideoStats(INPUT)).rejects.toBeInstanceOf(AnalyticsUnavailable);
    await expect(fetchVideoStats(INPUT)).rejects.toThrow(/Connect YouTube/);
    await expect(fetchVideoStats(INPUT)).rejects.toThrow(/403/);
  });

  it("surfaces a 403 on the curve alone, rather than swallowing it", async () => {
    stubFetch({
      basic: basicReport(["views"], [10]),
      retention: { status: 403, text: "insufficient scope" },
    });

    await expect(fetchVideoStats(INPUT)).rejects.toBeInstanceOf(AnalyticsUnavailable);
    await expect(fetchVideoStats(INPUT)).rejects.toThrow(/Connect YouTube/);
  });

  it("treats a 401 as unavailability too, and names the same button", async () => {
    stubFetch({ basic: { status: 401, text: "invalid credentials" } });

    const caught = await fetchVideoStats(INPUT).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(AnalyticsUnavailable);
    expect((caught as Error).name).toBe("AnalyticsUnavailable");
    expect((caught as Error).message).toMatch(/Connect YouTube/);
    expect((caught as Error).message).toMatch(/401/);
  });

  it("keeps the numbers that arrived when only the curve fails plainly", async () => {
    // A missing curve is no reason to throw away view counts that came back.
    stubFetch({
      basic: basicReport(["views", "likes"], [1_234, 56]),
      retention: { status: 500, text: "backend error" },
    });

    const stats = await fetchVideoStats(INPUT);

    expect(stats.views).toBe(1_234);
    expect(stats.likes).toBe(56);
    expect(stats.retention3s).toBeNull();
    expect(stats.relativeRetention).toBeNull();
  });

  it("survives a curve that is not JSON at all", async () => {
    stubFetch({
      basic: basicReport(["views"], [9]),
      retention: { status: 200, text: "<html>gateway</html>" },
    });

    const stats = await fetchVideoStats(INPUT);

    expect(stats.views).toBe(9);
    expect(stats.retention3s).toBeNull();
  });

  it("throws a plain Error, not AnalyticsUnavailable, when the basic call 500s", async () => {
    // Reconnecting fixes nothing here; calling it unavailability would send the
    // operator to press a button that cannot help.
    stubFetch({ basic: { status: 500, text: "internal error" } });

    const caught = await fetchVideoStats(INPUT).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(AnalyticsUnavailable);
    expect((caught as Error).message).toMatch(/HTTP 500/);
  });

  it("does not even ask for the curve when the basic call has already failed", async () => {
    const fetchMock = stubFetch({ basic: { status: 500, text: "internal error" } });

    await fetchVideoStats(INPUT).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
