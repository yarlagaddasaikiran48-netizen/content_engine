import { describe, expect, it } from "vitest";

import {
  MIN_GAP_POINTS,
  MIN_GROUP,
  MIN_SAMPLE,
  buildLearningBrief,
  engagementRate,
  hookLine,
  hookWordCount,
  isMeasured,
  opensWithQuestion,
  renderLearningBrief,
  score,
  type PerformedVideo,
} from "@/lib/learning/insights";

/**
 * A published video with nothing measured, so every test below states only the
 * handful of fields it is actually about.
 */
function video(overrides: Partial<PerformedVideo> = {}): PerformedVideo {
  return {
    id: "video-1",
    title: "An episode",
    script_body: "Something happened.",
    youtube_video_id: null,
    youtube_url: null,
    published_at: "2026-01-01T00:00:00.000Z",
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
    ...overrides,
  };
}

/** The same, but already carrying the one field that makes it count as measured. */
function measuredVideo(overrides: Partial<PerformedVideo> = {}): PerformedVideo {
  return video({
    stats_updated_at: "2026-02-01T00:00:00.000Z",
    retention_3s: 0.5,
    ...overrides,
  });
}

/** N copies of a fixture, each with its own id so nothing collides silently. */
function many(count: number, overrides: (index: number) => Partial<PerformedVideo>) {
  return Array.from({ length: count }, (_, index) =>
    measuredVideo({ id: `video-${index}`, ...overrides(index) }),
  );
}

describe("hookLine", () => {
  it("takes the first sentence and leaves the rest of the script behind", () => {
    expect(hookLine("Shiva opened his third eye. The mountain burned.")).toBe(
      "Shiva opened his third eye.",
    );
  });

  it("stops at an exclamation mark or a question mark just as readily", () => {
    expect(hookLine("Stop! You are about to lose him.")).toBe("Stop!");
    expect(hookLine("Do you know why? Nobody does.")).toBe("Do you know why?");
  });

  it("treats the danda as a full stop, so Telugu and Hindi split like English", () => {
    expect(hookLine("శివుడు మూడవ కన్ను తెరిచాడు। పర్వతం కాలిపోయింది।")).toBe(
      "శివుడు మూడవ కన్ను తెరిచాడు।",
    );
  });

  it("splits Telugu written with an ordinary full stop", () => {
    expect(hookLine("ఈ కథ నీకు తెలుసా. శివుడు కోపంగా ఉన్నాడు.")).toBe("ఈ కథ నీకు తెలుసా.");
  });

  it("returns an empty string for an empty or blank body", () => {
    expect(hookLine("")).toBe("");
    expect(hookLine("   \n  ")).toBe("");
  });

  it("does not mistake a decimal point for the end of the sentence", () => {
    // The regex demands whitespace or end-of-string after the stop, which is
    // the only thing separating "3.5 seconds" from a sentence boundary.
    expect(hookLine("He waited 3.5 seconds. Then he spoke.")).toBe("He waited 3.5 seconds.");
  });

  it("keeps leading and trailing whitespace out of the line", () => {
    expect(hookLine("   Shiva opened his eye.   And then.  ")).toBe("Shiva opened his eye.");
  });

  it("falls back to the first twelve words when the body has no punctuation at all", () => {
    // The contract in the header comment: "A script with no punctuation at all
    // yields its first dozen words rather than the whole body".
    const body = "Shiva opened his third eye and the mountain burned to ash before anyone could speak";

    expect(hookLine(body)).toBe(
      "Shiva opened his third eye and the mountain burned to ash before",
    );
  });

  it("falls back to the first twelve words when the first sentence runs past 160 characters", () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index + 1}`);
    const body = `${words.join(" ")}. And a second sentence.`;

    expect(body.indexOf(".")).toBeGreaterThan(160);
    expect(hookLine(body)).toBe(words.slice(0, 12).join(" "));
  });

  it("never returns more than twelve words once it has fallen back", () => {
    const body = `${"padding ".repeat(60).trim()}.`;
    expect(hookLine(body).split(/\s+/)).toHaveLength(12);
  });
});

describe("hookWordCount", () => {
  it("counts the words of the opening line, not of the whole script", () => {
    expect(hookWordCount("Shiva opened his third eye. The mountain burned to ash.")).toBe(5);
  });

  it("counts Telugu words split on the danda", () => {
    expect(hookWordCount("శివుడు మూడవ కన్ను తెరిచాడు। పర్వతం కాలిపోయింది।")).toBe(4);
  });

  it("is zero for an empty body", () => {
    expect(hookWordCount("")).toBe(0);
    expect(hookWordCount("   ")).toBe(0);
  });

  it("does not let runs of whitespace inflate the count", () => {
    expect(hookWordCount("Shiva   opened\n\nhis eye.")).toBe(4);
  });
});

describe("opensWithQuestion", () => {
  it("says yes when the opening line ends in a question mark", () => {
    expect(opensWithQuestion("Do you know why he waited? He waited for her.")).toBe(true);
  });

  it("says yes for a Telugu question asked without a question mark", () => {
    expect(opensWithQuestion("శివుడు ఎందుకు కోపగించాడు. ఎవరికీ తెలియదు.")).toBe(true);
    expect(opensWithQuestion("ఈ కథ నీకు తెలుసా. ఇది శివుని కథ.")).toBe(true);
  });

  it("says no for a plain statement", () => {
    expect(opensWithQuestion("Shiva opened his third eye. The mountain burned.")).toBe(false);
    expect(opensWithQuestion("శివుడు మూడవ కన్ను తెరిచాడు। పర్వతం కాలిపోయింది।")).toBe(false);
  });

  it("says no for an empty body", () => {
    expect(opensWithQuestion("")).toBe(false);
  });

  it("ignores a question that only arrives after the opening line", () => {
    expect(opensWithQuestion("He opened his eye. Do you know why?")).toBe(false);
  });
});

describe("engagementRate", () => {
  it("falls back to raw views when engaged views is a reported zero", () => {
    // `engaged_views ?? views` would take the zero, because ?? only falls
    // through on null — and a Short in its first hours genuinely reports
    // thousands of views against no engaged views yet.
    const rate = engagementRate(video({ engaged_views: 0, views: 1_000, likes: 50 }));
    expect(rate).toBeCloseTo(0.05, 10);
  });

  it("prefers engaged views over raw views", () => {
    const rate = engagementRate(video({ engaged_views: 100, views: 1_000, likes: 10 }));
    expect(rate).toBeCloseTo(0.1, 10);
  });

  it("falls back to raw views when engaged views were never reported", () => {
    const rate = engagementRate(video({ engaged_views: null, views: 1_000, likes: 10 }));
    expect(rate).toBeCloseTo(0.01, 10);
  });

  it("weighs a subscribe above a share above a comment above a like", () => {
    const likes = engagementRate(video({ views: 100, likes: 1 }));
    const comments = engagementRate(video({ views: 100, comments: 1 }));
    const shares = engagementRate(video({ views: 100, shares: 1 }));
    const subscribers = engagementRate(video({ views: 100, subscribers_gained: 1 }));

    expect(likes).toBeCloseTo(0.01, 10);
    expect(comments).toBeCloseTo(0.03, 10);
    expect(shares).toBeCloseTo(0.05, 10);
    expect(subscribers).toBeCloseTo(0.1, 10);
  });

  it("adds the weighted actions together over the same base", () => {
    // 10 likes + 5 comments + 2 shares + 1 subscribe = 10 + 15 + 10 + 10 = 45.
    const rate = engagementRate(
      video({
        engaged_views: 100,
        likes: 10,
        comments: 5,
        shares: 2,
        subscribers_gained: 1,
      }),
    );

    expect(rate).toBeCloseTo(0.45, 10);
  });

  it("treats a missing action count as none of that action rather than as unknown", () => {
    expect(engagementRate(video({ views: 100 }))).toBe(0);
  });

  it("returns null when there is no audience to divide by", () => {
    expect(engagementRate(video({ engaged_views: null, views: null, likes: 5 }))).toBeNull();
    expect(engagementRate(video({ engaged_views: 0, views: 0, likes: 5 }))).toBeNull();
    expect(engagementRate(video({ engaged_views: null, views: 0, likes: 5 }))).toBeNull();
  });
});

describe("score", () => {
  it("returns null when nothing at all was measured", () => {
    expect(score(video())).toBeNull();
  });

  it("scores a video on completion alone when completion is all it has", () => {
    // The missing components hand their weight to the one that is present, so
    // 70% watched is 0.7 and not 0.7 of some fraction of the total weight.
    expect(score(video({ average_view_percentage: 70 }))).toBeCloseTo(0.7, 10);
  });

  it("scores a video on hook retention alone when retention is all it has", () => {
    expect(score(video({ retention_3s: 0.62 }))).toBeCloseTo(0.62, 10);
  });

  it("scores a video on engagement alone, with 10% of actions per view as full marks", () => {
    expect(score(video({ views: 100, likes: 10 }))).toBeCloseTo(1, 10);
    expect(score(video({ views: 100, likes: 5 }))).toBeCloseTo(0.5, 10);
  });

  it("weighs the hook above completion above engagement when all three are present", () => {
    // 0.8*0.45 + 0.60*0.35 + 1*0.2 = 0.36 + 0.21 + 0.2 = 0.77, over a full weight of 1.
    const value = score(
      video({
        retention_3s: 0.8,
        average_view_percentage: 60,
        views: 100,
        likes: 10,
      }),
    );

    expect(value).toBeCloseTo(0.77, 10);
  });

  it("redistributes the weight of whichever component is missing", () => {
    // Hook 0.45 and completion 0.35 only: 0.8*0.45 + 0.6*0.35 = 0.57, over 0.8.
    const value = score(video({ retention_3s: 0.8, average_view_percentage: 60 }));
    expect(value).toBeCloseTo(0.57 / 0.8, 10);
  });

  it("clamps values that arrive outside their range instead of letting them run away", () => {
    expect(score(video({ retention_3s: 1.4 }))).toBe(1);
    expect(score(video({ average_view_percentage: 180 }))).toBe(1);
    expect(score(video({ views: 100, likes: 500 }))).toBe(1);
    expect(score(video({ retention_3s: -0.5 }))).toBe(0);
    expect(score(video({ average_view_percentage: -20 }))).toBe(0);
  });

  it("always lands between zero and one", () => {
    const extremes = [
      video({ retention_3s: 2, average_view_percentage: 400, views: 10, likes: 900 }),
      video({ retention_3s: -3, average_view_percentage: -50, views: 10 }),
      video({ retention_3s: 0.33, average_view_percentage: 47, views: 200, comments: 4 }),
    ];

    for (const candidate of extremes) {
      const value = score(candidate);
      expect(value).not.toBeNull();
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(1);
    }
  });
});

describe("isMeasured", () => {
  it("needs a stats timestamp and at least one retention number", () => {
    expect(isMeasured(video({ stats_updated_at: "2026-02-01", retention_3s: 0.5 }))).toBe(true);
    expect(
      isMeasured(video({ stats_updated_at: "2026-02-01", average_view_percentage: 50 })),
    ).toBe(true);
  });

  it("rejects a video whose stats have never been fetched", () => {
    expect(isMeasured(video({ stats_updated_at: null, retention_3s: 0.5 }))).toBe(false);
  });

  it("rejects a video that was fetched but came back without a retention curve", () => {
    expect(isMeasured(video({ stats_updated_at: "2026-02-01", views: 5_000 }))).toBe(false);
  });

  it("counts a zero retention as measured, because zero is a measurement", () => {
    expect(isMeasured(video({ stats_updated_at: "2026-02-01", retention_3s: 0 }))).toBe(true);
  });
});

describe("buildLearningBrief", () => {
  it("stays silent below the minimum sample", () => {
    expect(buildLearningBrief([])).toBeNull();
    expect(buildLearningBrief(many(MIN_SAMPLE - 1, () => ({})))).toBeNull();
  });

  it("does not count unmeasured videos towards the sample", () => {
    const measured = many(MIN_SAMPLE - 1, () => ({}));
    const unmeasured = Array.from({ length: 10 }, (_, index) =>
      video({ id: `unmeasured-${index}`, views: 9_000 }),
    );

    expect(buildLearningBrief([...measured, ...unmeasured])).toBeNull();
  });

  it("speaks once there are enough measured videos, and reports the sample it used", () => {
    const brief = buildLearningBrief([
      ...many(MIN_SAMPLE, () => ({})),
      video({ id: "not-measured", views: 100 }),
    ]);

    expect(brief).not.toBeNull();
    expect(brief?.sampleSize).toBe(MIN_SAMPLE);
  });

  it("states a comparison when both sides are big enough and the gap is wide enough", () => {
    const brief = buildLearningBrief([
      ...many(3, (i) => ({ id: `shiva-${i}`, deity: "Shiva", retention_3s: 0.71 })),
      ...many(3, (i) => ({ id: `vishnu-${i}`, deity: "Vishnu", retention_3s: 0.52 })),
    ]);

    expect(brief?.findings).toHaveLength(1);
    const finding = brief?.findings[0] as string;
    expect(finding).toContain("Shiva");
    expect(finding).toContain("Vishnu");
    expect(finding).toContain("71%");
    expect(finding).toContain("52%");
    expect(finding).toContain("19-point gap across 3 and 3 videos");
  });

  it("says nothing when the gap is real but smaller than the threshold", () => {
    // Five points, one short of MIN_GAP_POINTS: inside the noise of a channel
    // this size, so the brief must not send the writer chasing it.
    const brief = buildLearningBrief([
      ...many(3, (i) => ({ id: `shiva-${i}`, deity: "Shiva", retention_3s: 0.6 })),
      ...many(3, (i) => ({ id: `vishnu-${i}`, deity: "Vishnu", retention_3s: 0.55 })),
    ]);

    expect(MIN_GAP_POINTS).toBe(6);
    expect(brief).not.toBeNull();
    expect(brief?.findings).toEqual([]);
  });

  it("states the comparison as soon as the gap reaches the threshold exactly", () => {
    const brief = buildLearningBrief([
      ...many(3, (i) => ({ id: `shiva-${i}`, deity: "Shiva", retention_3s: 0.6 })),
      ...many(3, (i) => ({ id: `vishnu-${i}`, deity: "Vishnu", retention_3s: 0.54 })),
    ]);

    expect(brief?.findings).toHaveLength(1);
    expect(brief?.findings[0]).toContain("6-point gap");
  });

  it("says nothing when only one side of the comparison is big enough", () => {
    // A four-to-two split with a huge gap is still a coin landing heads twice.
    const brief = buildLearningBrief([
      ...many(4, (i) => ({ id: `shiva-${i}`, deity: "Shiva", retention_3s: 0.8 })),
      ...many(2, (i) => ({ id: `vishnu-${i}`, deity: "Vishnu", retention_3s: 0.2 })),
    ]);

    expect(MIN_GROUP).toBe(3);
    expect(brief).not.toBeNull();
    expect(brief?.findings).toEqual([]);
  });

  it("says nothing when a group is big enough but too few of it were measured on that metric", () => {
    const brief = buildLearningBrief([
      ...many(3, (i) => ({ id: `shiva-${i}`, deity: "Shiva", retention_3s: 0.8 })),
      measuredVideo({ id: "vishnu-0", deity: "Vishnu", retention_3s: 0.2 }),
      measuredVideo({
        id: "vishnu-1",
        deity: "Vishnu",
        retention_3s: null,
        average_view_percentage: 20,
      }),
      measuredVideo({
        id: "vishnu-2",
        deity: "Vishnu",
        retention_3s: null,
        average_view_percentage: 20,
      }),
    ]);

    expect(brief).not.toBeNull();
    expect(brief?.findings).toEqual([]);
  });

  it("compares tones on how much of the script was watched", () => {
    const brief = buildLearningBrief([
      ...many(3, (i) => ({ id: `soft-${i}`, tone: "soft" as const, average_view_percentage: 72 })),
      ...many(3, (i) => ({
        id: `intense-${i}`,
        tone: "intense" as const,
        average_view_percentage: 51,
      })),
    ]);

    expect(brief?.findings).toHaveLength(1);
    expect(brief?.findings[0]).toContain('"soft"');
    expect(brief?.findings[0]).toContain('"intense"');
    expect(brief?.findings[0]).toContain("21-point gap");
  });

  it("compares short openings against long ones", () => {
    const short = "He burned.";
    const long =
      "On the seventh night of the long and bitter winter the old priest finally spoke aloud.";

    const brief = buildLearningBrief([
      ...many(3, (i) => ({ id: `short-${i}`, script_body: short, retention_3s: 0.74 })),
      ...many(3, (i) => ({ id: `long-${i}`, script_body: long, retention_3s: 0.5 })),
    ]);

    expect(hookWordCount(short)).toBeLessThanOrEqual(6);
    expect(hookWordCount(long)).toBeGreaterThanOrEqual(12);
    expect(brief?.findings).toHaveLength(1);
    expect(brief?.findings[0]).toContain("six words or fewer");
    expect(brief?.findings[0]).toContain("twelve words or more");
  });

  it("compares openings that ask against openings that tell", () => {
    const brief = buildLearningBrief([
      ...many(3, (i) => ({
        id: `ask-${i}`,
        script_body: "Do you know why he waited? He waited for her.",
        retention_3s: 0.75,
      })),
      ...many(3, (i) => ({
        id: `tell-${i}`,
        script_body: "He waited for her all night long.",
        retention_3s: 0.55,
      })),
    ]);

    const shapeFinding = brief?.findings.find((f) => f.includes("opening on a question"));
    expect(shapeFinding).toBeDefined();
    expect(shapeFinding).toContain("opening on a statement");
    expect(shapeFinding).toContain("20 points");
  });

  it("orders the strongest hooks by score, best first", () => {
    const brief = buildLearningBrief(
      [0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.45, 0.4, 0.3].map((retention, index) =>
        measuredVideo({
          id: `video-${index}`,
          script_body: `Hook ${index}. And then more of the script.`,
          retention_3s: retention,
        }),
      ),
    );

    expect(brief?.strongestHooks).toEqual([
      "Hook 0.",
      "Hook 1.",
      "Hook 2.",
      "Hook 3.",
      "Hook 4.",
    ]);
  });

  it("orders the weakest hooks by score, worst first", () => {
    const brief = buildLearningBrief(
      [0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.45, 0.4, 0.3].map((retention, index) =>
        measuredVideo({
          id: `video-${index}`,
          script_body: `Hook ${index}. And then more of the script.`,
          retention_3s: retention,
        }),
      ),
    );

    expect(brief?.weakestHooks).toEqual(["Hook 9.", "Hook 8.", "Hook 7."]);
  });

  it("never shows the same opening as both a strongest and a weakest hook", () => {
    // At the minimum sample a naive top-five and bottom-three would share two
    // videos, which would tell the writer an opening both held and lost people.
    const brief = buildLearningBrief(
      [0.9, 0.8, 0.7, 0.6, 0.5, 0.4].map((retention, index) =>
        measuredVideo({
          id: `video-${index}`,
          script_body: `Hook ${index}. And then more of the script.`,
          retention_3s: retention,
        }),
      ),
    );

    expect(brief?.strongestHooks).toEqual(["Hook 0.", "Hook 1.", "Hook 2."]);
    expect(brief?.weakestHooks).toEqual(["Hook 5.", "Hook 4.", "Hook 3."]);

    const overlap = (brief?.strongestHooks ?? []).filter((hook) =>
      (brief?.weakestHooks ?? []).includes(hook),
    );
    expect(overlap).toEqual([]);
  });

  it("names at most five strongest and three weakest openings", () => {
    const brief = buildLearningBrief(
      Array.from({ length: 12 }, (_, index) =>
        measuredVideo({
          id: `video-${index}`,
          script_body: `Hook ${index}. And then more of the script.`,
          retention_3s: 1 - index * 0.05,
        }),
      ),
    );

    expect(brief?.strongestHooks).toHaveLength(5);
    expect(brief?.weakestHooks).toHaveLength(3);
    expect(brief?.strongestHooks[0]).toBe("Hook 0.");
    expect(brief?.weakestHooks[0]).toBe("Hook 11.");
  });

  it("ranks on the composite score, not on hook retention alone", () => {
    // The second video loses the hook comparison and wins overall, because it
    // holds people to the end and they act on it.
    const videos = [
      measuredVideo({
        id: "flashy",
        script_body: "Flashy opening.",
        retention_3s: 0.7,
        average_view_percentage: 10,
        views: 1_000,
        likes: 1,
      }),
      measuredVideo({
        id: "durable",
        script_body: "Durable opening.",
        retention_3s: 0.65,
        average_view_percentage: 95,
        views: 1_000,
        likes: 120,
      }),
      ...many(4, (i) => ({ id: `filler-${i}`, script_body: `Filler ${i}.`, retention_3s: 0.01 })),
    ];

    const brief = buildLearningBrief(videos);
    expect(brief?.strongestHooks[0]).toBe("Durable opening.");
  });

  it("drops videos whose score cannot be computed out of the ranking", () => {
    // Measured only by a stats timestamp plus average_view_percentage still
    // scores; a video measured on nothing scorable must not be ranked at all.
    const videos = [
      ...many(5, (i) => ({ id: `real-${i}`, script_body: `Real ${i}.`, retention_3s: 0.5 })),
      measuredVideo({
        id: "unscorable",
        script_body: "Unscorable opening.",
        retention_3s: null,
        average_view_percentage: null,
      }),
    ];

    // stats_updated_at plus nothing measurable is not measured at all, so the
    // sample falls one short and the brief stays silent.
    expect(buildLearningBrief(videos)).toBeNull();
  });
});

describe("renderLearningBrief", () => {
  const brief = buildLearningBrief([
    ...many(3, (i) => ({
      id: `shiva-${i}`,
      script_body: `Shiva opened his eye ${i}. The mountain burned.`,
      deity: "Shiva",
      retention_3s: 0.71,
    })),
    ...many(3, (i) => ({
      id: `vishnu-${i}`,
      script_body: `Vishnu slept on the serpent ${i}. The ocean waited.`,
      deity: "Vishnu",
      retention_3s: 0.52,
    })),
  ]);

  it("returns null when there is no brief to render", () => {
    expect(renderLearningBrief(null)).toBeNull();
  });

  it("returns null for a brief that found nothing and has no hooks to show", () => {
    expect(
      renderLearningBrief({
        sampleSize: 9,
        findings: [],
        strongestHooks: [],
        weakestHooks: [],
      }),
    ).toBeNull();
  });

  it("says how many published videos the brief was measured over", () => {
    const text = renderLearningBrief(brief) as string;
    expect(text).toContain("measured over 6 published videos");
    expect(text).toContain("not guessed");
  });

  it("closes with the instruction that keeps the writer from copying a hook", () => {
    const text = renderLearningBrief(brief) as string;
    expect(text).toContain("Take the shape, never the wording");
    expect(text.trimEnd().endsWith("how much they refuse to explain.")).toBe(true);
  });

  it("lists the findings and both sets of openings", () => {
    const text = renderLearningBrief(brief) as string;
    expect(text).toContain("Episodes about Shiva");
    expect(text).toContain("The openings that held the most people:");
    expect(text).toContain("The openings that lost the most people:");
    expect(text).toContain("- Shiva opened his eye 0.");
  });

  it("renders a brief that has hooks but no findings yet", () => {
    const quiet = buildLearningBrief(
      many(MIN_SAMPLE, (i) => ({ script_body: `Hook ${i}. And more.`, retention_3s: 0.5 })),
    );

    expect(quiet?.findings).toEqual([]);
    const text = renderLearningBrief(quiet) as string;
    expect(text).toContain("The openings that held the most people:");
    expect(text).toContain("Take the shape, never the wording");
  });
});
