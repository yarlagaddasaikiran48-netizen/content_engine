import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The timeout that produced "Unexpected token 'A'".
 *
 * Generation is allowed up to four attempts, each one a full Gemini call.
 * Nothing stopped it from starting a fourth attempt with eight seconds left,
 * so on a bad run the function sailed past Vercel's sixty-second limit, was
 * killed, and returned the platform's plain-text error page. The browser then
 * called response.json() on "An error occurred with your deployment" and the
 * operator saw a parser complaining about the letter A -- with the log of what
 * had actually gone wrong discarded along with the response.
 *
 * These tests pin the fix: generation refuses to BEGIN an attempt it cannot
 * finish, and returns a real answer with the log attached instead.
 */

let attemptDurationMs = 0;
let generateCalls = 0;
let claimCalls: string[] = [];
let topicsSeen: string[] = [];
let feedbackSeen: Array<string | null> = [];
let validationErrors = ["Script is 52 words; too short for 60 seconds (minimum 68)."];

const CONFIG = {
  maxGenerationAttempts: 4,
  targetSeconds: 60,
  ttsWordsPerMinute: 80,
  wordCountTolerance: 0.15,
  geminiApiKeys: ["key-1"],
  geminiModels: ["model-a"],
  learningEnabled: false,
  puranaRotation: false,
  rotationEpoch: new Date(0),
  rotationDaysPerPurana: 1,
  similarityThreshold: 0.45,
};

vi.mock("@/lib/settings/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/config")>();
  return { ...actual, loadConfig: async () => CONFIG };
});

vi.mock("@/lib/sources/hook", () => ({
  buildHookContext: async () => ({
    summary: "Today is a test.",
    occasion: "Test",
    trends: [],
    festival: null,
  }),
}));

vi.mock("@/lib/gemini/generate", () => ({
  generateScript: async (input: { topic: { topic_key: string }; lengthFeedback?: string | null }) => {
    generateCalls += 1;
    topicsSeen.push(input.topic.topic_key);
    feedbackSeen.push(input.lengthFeedback ?? null);
    // Stand in for the real cost of a Gemini call for a 60-second script.
    await new Promise((resolve) => setTimeout(resolve, attemptDurationMs));
    return {
      title: "A title long enough to pass",
      script_body: "కథ",
      seo_description: "description",
      hashtags: ["#shorts"],
      tone: "soft",
      deity: "Shiva",
      scene_prompt: "a scene",
    };
  },
}));

// Every script is rejected, which is the run that used to overrun: four full
// attempts, none of them producing anything.
vi.mock("@/lib/safety/validate", () => ({
  validateScript: () => ({
    valid: false,
    errors: validationErrors,
    safetyIssues: [],
    cleaned: null,
  }),
}));

vi.mock("@/lib/learning/insights", () => ({
  buildLearningBrief: () => null,
  renderLearningBrief: () => null,
}));
vi.mock("@/lib/learning/store", () => ({ readPerformance: async () => [] }));
vi.mock("@/lib/sources/gita", () => ({ fetchGitaVerse: async () => null }));
vi.mock("@/lib/pipeline/cooldown", () => ({
  describeCooldown: () => "an hour",
  surveyTargets: async () => ({ free: [], soonest: 3_600 }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string) => {
      if (fn === "claim_unused_topic") {
        claimCalls.push(fn);
        return {
          data: {
            topic_key: `topic-${claimCalls.length}`,
            source: "purana",
            scripture: "Shiva Purana",
            reference: "1.1",
            title: "A topic",
            theme: "dharma",
            summary: "something happens",
            citation_url: "https://example.test/1",
            sanskrit: null,
            translation: null,
            translator: null,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
  }),
}));

async function run(deadlineMs: number) {
  const { generateVideo } = await import("@/lib/pipeline/generate-video");
  return generateVideo({ deadline: Date.now() + deadlineMs });
}

// Top level on purpose: scoped inside one describe, these counters carried
// over into the next block and it measured the previous block's run.
beforeEach(() => {
  generateCalls = 0;
  claimCalls = [];
  topicsSeen = [];
  feedbackSeen = [];
  attemptDurationMs = 0;
  validationErrors = ["Script is 52 words; too short for 60 seconds (minimum 68)."];
});

describe("generateVideo deadlines", () => {
  it("stops before starting an attempt it cannot finish", async () => {
    // Each attempt costs 60ms; the budget allows roughly one.
    attemptDurationMs = 60;

    const result = await run(80);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ran out of time/i);
    expect(generateCalls).toBeLessThan(CONFIG.maxGenerationAttempts);
  });

  it("always returns the log, which is the whole point of not being killed", async () => {
    attemptDurationMs = 60;

    const result = await run(80);

    expect(Array.isArray(result.log)).toBe(true);
    expect(result.log.length).toBeGreaterThan(0);
    // The reason each script was thrown away has to survive.
    expect(result.log.join("\n")).toMatch(/rejected/i);
  });

  it("reports how many attempts actually ran, not how many were allowed", async () => {
    attemptDurationMs = 60;

    const result = await run(80);

    expect(result.attempts).toBe(generateCalls);
    expect(result.attempts).toBeGreaterThan(0);
  });

  it("uses every allowed attempt when there is time for them", async () => {
    attemptDurationMs = 0;

    const result = await run(30_000);

    expect(generateCalls).toBe(CONFIG.maxGenerationAttempts);
    expect(result.error).not.toMatch(/ran out of time/i);
    expect(result.error).toMatch(/could not produce an acceptable script/i);
  });

  it("always runs the first attempt, however little time is left", async () => {
    // A deadline already in the past must not produce a run that did nothing
    // and explained nothing — one attempt is what tells the operator why.
    attemptDurationMs = 0;

    const result = await run(-5_000);

    expect(generateCalls).toBe(1);
    expect(result.ok).toBe(false);
  });
});

/**
 * Measured, not assumed: the Telugu voices read at 83 words a minute, so the
 * 68-92 window for a 60-second script is correct and the model was simply
 * writing short — 67, 52, 57 and 51 words across four attempts in production.
 *
 * Each of those cost a scripture passage. That is the expensive part: the
 * ledger took eight hundred hand-built entries to fill, and a script that is
 * one word short is the right story told slightly too fast, not the wrong
 * story.
 */
describe("a script that is only the wrong length", () => {
  it("tells the same passage again instead of spending another one", async () => {
    attemptDurationMs = 0;

    await run(30_000);

    expect(topicsSeen[0]).toBe(topicsSeen[1]);
  });

  it("tells the model the count it actually hit", async () => {
    await run(30_000);

    expect(feedbackSeen[0]).toBeNull();
    expect(feedbackSeen[1]).toContain("52 words");
    expect(feedbackSeen[1]).toMatch(/same episode again/i);
  });

  it("gives each passage one second chance, not an unlimited supply", async () => {
    await run(30_000);

    // Four attempts, two passages, each told twice — never the same one thrice.
    const counts = new Map<string, number>();
    for (const key of topicsSeen) counts.set(key, (counts.get(key) ?? 0) + 1);
    expect([...counts.values()].every((n) => n <= 2)).toBe(true);
    expect(new Set(topicsSeen).size).toBeGreaterThan(1);
  });

  it("does not re-tell a passage rejected for anything else", async () => {
    // A banned phrase or Latin letters in the narration says the ANGLE was
    // wrong, and the right answer is a different story, not the same one again.
    validationErrors = ["Narration contains Latin letters."];

    await run(30_000);

    expect(new Set(topicsSeen).size).toBe(topicsSeen.length);
  });

  it("does not carry the feedback into an unrelated passage", async () => {
    await run(30_000);

    // Attempt 3 starts a new passage, so it must arrive with a clean slate.
    expect(feedbackSeen[2]).toBeNull();
  });
});
