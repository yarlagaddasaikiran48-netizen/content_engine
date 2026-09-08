import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stand in for the Supabase-backed lease, so the seam under test is the walk. */
const cooled = new Map<string, number>();

vi.mock("@/lib/pipeline/cooldown", () => ({
  surveyTargets: async (
    purpose: string,
    targets: Array<{ key: string; model: string }>,
  ) => {
    const free = targets.filter((t) => !cooled.has(`${purpose}:${t.model}:${t.key}`));
    return { free, soonest: free.length > 0 ? 0 : 3_600 };
  },
  startQuotaCooldown: async (
    purpose: string,
    target: { key: string; model: string },
    seconds: number,
  ) => {
    cooled.set(`${purpose}:${target.model}:${target.key}`, seconds);
  },
  describeCooldown: (seconds: number) => `${seconds} seconds`,
}));

const { buildTargets, withGeminiTarget, AllTargetsExhaustedError, NoGeminiKeyError } =
  await import("@/lib/gemini/rotate");

const QUOTA = "429 RESOURCE_EXHAUSTED: quota exceeded";
const UNKNOWN = "models/made-up is not found for API version v1beta";

beforeEach(() => cooled.clear());

describe("buildTargets", () => {
  it("walks models on the outside and keys on the inside", () => {
    // Best model on every key before any key drops to a lesser one — quality
    // degrades only when there is no remaining way to avoid it.
    expect(buildTargets(["k1", "k2"], ["good", "cheap"])).toEqual([
      { key: "k1", model: "good" },
      { key: "k2", model: "good" },
      { key: "k1", model: "cheap" },
      { key: "k2", model: "cheap" },
    ]);
  });
});

describe("withGeminiTarget", () => {
  it("stops at the first target that answers", async () => {
    const seen: string[] = [];
    const result = await withGeminiTarget("text", ["k1"], ["good", "cheap"], async (t) => {
      seen.push(t.model);
      return "script";
    });

    expect(result).toBe("script");
    expect(seen).toEqual(["good"]);
  });

  it("comes down the ladder as each model's daily budget runs out", async () => {
    // The whole point: gemini-3.6-flash allows 20 requests a day and the lite
    // models allow 500. Refusing the first must not end the day.
    const seen: string[] = [];
    const result = await withGeminiTarget("text", ["k1"], ["good", "mid", "cheap"], async (t) => {
      seen.push(t.model);
      if (t.model !== "cheap") throw new Error(QUOTA);
      return "script";
    });

    expect(result).toBe("script");
    expect(seen).toEqual(["good", "mid", "cheap"]);
  });

  it("remembers each refusal, so the next run starts past it", async () => {
    await withGeminiTarget("text", ["k1"], ["good", "cheap"], async (t) => {
      if (t.model === "good") throw new Error(QUOTA);
      return "script";
    });

    expect([...cooled.keys()]).toEqual(["text:good:k1"]);

    const seen: string[] = [];
    await withGeminiTarget("text", ["k1"], ["good", "cheap"], async (t) => {
      seen.push(t.model);
      return "script";
    });
    expect(seen).toEqual(["cheap"]);
  });

  it("tries every key's copy of the good model before dropping to the cheap one", async () => {
    const seen: string[] = [];
    await withGeminiTarget("text", ["k1", "k2"], ["good", "cheap"], async (t) => {
      seen.push(`${t.model}/${t.key}`);
      if (t.model === "good") throw new Error(QUOTA);
      return "script";
    });

    expect(seen).toEqual(["good/k1", "good/k2", "cheap/k1"]);
  });

  it("skips a model Google does not recognise instead of failing the run", async () => {
    // The default chain names models this code cannot verify exist. One wrong
    // name must cost the run one request, not the whole run.
    const result = await withGeminiTarget("text", ["k1"], ["made-up", "real"], async (t) => {
      if (t.model === "made-up") throw new Error(UNKNOWN);
      return "script";
    });

    expect(result).toBe("script");
    expect(cooled.get("text:made-up:k1")).toBe(86_400);
  });

  it("does not spend a second target on a failure that is not about quota", async () => {
    // A blocked prompt fails identically everywhere; continuing would burn a
    // good budget proving what the first target already established.
    const seen: string[] = [];

    await expect(
      withGeminiTarget("text", ["k1", "k2"], ["good", "cheap"], async (t) => {
        seen.push(t.model);
        throw new Error("Gemini blocked the prompt (SAFETY).");
      }),
    ).rejects.toThrow(/blocked the prompt/);

    expect(seen).toEqual(["good"]);
    expect(cooled.size).toBe(0);
  });

  it("reports exhaustion once every model on every key is spent", async () => {
    await expect(
      withGeminiTarget("text", ["k1", "k2"], ["good", "cheap"], async () => {
        throw new Error(QUOTA);
      }),
    ).rejects.toThrow(/RESOURCE_EXHAUSTED|quota/i);

    expect(cooled.size).toBe(4);
  });

  it("refuses to start when nothing is configured", async () => {
    await expect(
      withGeminiTarget("text", [], ["good"], async () => "script"),
    ).rejects.toBeInstanceOf(NoGeminiKeyError);

    await expect(
      withGeminiTarget("text", ["k1"], [], async () => "script"),
    ).rejects.toBeInstanceOf(NoGeminiKeyError);
  });

  it("says it is a configuration mistake when no model name is recognised", async () => {
    // Calling this RESOURCE_EXHAUSTED would send the operator to the quota
    // page to fix what is actually a typo in Settings.
    await expect(
      withGeminiTarget("text", ["k1"], ["made-up", "also-made-up"], async () => {
        throw new Error(UNKNOWN);
      }),
    ).rejects.toBeInstanceOf(NoGeminiKeyError);
  });

  it("stands every target down before giving up, so the tick does not re-ask", async () => {
    await expect(
      withGeminiTarget("tts", ["k1"], ["v1", "v2"], async () => {
        throw new Error(QUOTA);
      }),
    ).rejects.toBeInstanceOf(Error);

    expect([...cooled.keys()].sort()).toEqual(["tts:v1:k1", "tts:v2:k1"]);
  });

  it("names the spent model in the log, and never the key", async () => {
    const log: string[] = [];
    await withGeminiTarget(
      "text",
      ["AIzaSy-secret-one", "AIzaSy-secret-two"],
      ["good", "cheap"],
      async (t) => {
        if (t.model === "good") throw new Error(QUOTA);
        return "script";
      },
      { log },
    );

    const text = log.join("\n");
    expect(text).toContain("good");
    expect(text).toContain("out of script quota");
    expect(text).not.toContain("AIzaSy-secret-one");
  });
});

describe("AllTargetsExhaustedError", () => {
  it("carries RESOURCE_EXHAUSTED so existing quota classifiers still match it", async () => {
    const { isQuotaError } = await import("@/lib/pipeline/fatal");
    const error = new AllTargetsExhaustedError("RESOURCE_EXHAUSTED: spent", 3_600);
    expect(isQuotaError(error.message)).toBe(true);
  });
});
