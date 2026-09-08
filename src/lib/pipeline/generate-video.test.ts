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
  generateScript: async () => {
    generateCalls += 1;
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
    errors: ["Script is 3 words; the range is 68-92."],
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

describe("generateVideo deadlines", () => {
  beforeEach(() => {
    generateCalls = 0;
    claimCalls = [];
    attemptDurationMs = 0;
  });

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
