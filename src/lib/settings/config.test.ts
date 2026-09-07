import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, { key: string; value: string | null; updatedAt: string | null }>();

vi.mock("@/lib/settings/store", () => ({
  readRawSettings: async () => stored,
  invalidateSettingsCache: () => {},
}));

const { loadConfig, requireSetting, wordWindow } = await import("@/lib/settings/config");

beforeEach(() => {
  stored.clear();
  delete process.env.TARGET_SECONDS;
  delete process.env.GEMINI_API_KEY;
});

function set(key: string, value: string) {
  stored.set(key, { key, value, updatedAt: new Date().toISOString() });
}

describe("loadConfig", () => {
  it("falls back to the catalogue default when nothing is stored", async () => {
    expect((await loadConfig()).targetSeconds).toBe(30);
  });

  it("uses the environment variable when the row is unset", async () => {
    process.env.TARGET_SECONDS = "45";
    expect((await loadConfig()).targetSeconds).toBe(45);
  });

  it("lets the stored row beat the environment variable", async () => {
    process.env.TARGET_SECONDS = "45";
    set("target_seconds", "60");
    expect((await loadConfig()).targetSeconds).toBe(60);
  });

  it("treats an empty stored value as unset and falls through to env", async () => {
    process.env.TARGET_SECONDS = "45";
    set("target_seconds", "");
    expect((await loadConfig()).targetSeconds).toBe(45);
  });

  it("parses posting_times into an array", async () => {
    expect((await loadConfig()).postingTimes).toEqual(["00:00", "04:00"]);
  });

  it("falls back to the default slots when posting_times is malformed", async () => {
    set("posting_times", "not json");
    expect((await loadConfig()).postingTimes).toEqual(["00:00", "04:00"]);
  });

  it("rejects posting_times entries that are not HH:MM", async () => {
    set("posting_times", '["8am","4am"]');
    expect((await loadConfig()).postingTimes).toEqual(["00:00", "04:00"]);
  });

  it("rejects an empty posting_times array rather than publishing never", async () => {
    set("posting_times", "[]");
    expect((await loadConfig()).postingTimes).toEqual(["00:00", "04:00"]);
  });

  it("derives videosPerDay from the number of posting times", async () => {
    set("posting_times", '["00:00","04:00","12:00"]');
    expect((await loadConfig()).videosPerDay).toBe(3);
  });

  it("parses booleans", async () => {
    set("learning_enabled", "false");
    expect((await loadConfig()).learningEnabled).toBe(false);
  });

  it("clamps a number below its catalogue minimum", async () => {
    set("target_seconds", "5");
    expect((await loadConfig()).targetSeconds).toBe(20);
  });

  it("clamps a number above its catalogue maximum", async () => {
    set("target_seconds", "600");
    expect((await loadConfig()).targetSeconds).toBe(90);
  });

  it("ignores a non-numeric number and uses the default", async () => {
    set("scripts_per_day", "lots");
    expect((await loadConfig()).scriptsPerDay).toBe(8);
  });

  it("strips a trailing slash from the site URL", async () => {
    set("site_url", "https://example.com/");
    expect((await loadConfig()).siteUrl).toBe("https://example.com");
  });
});

describe("wordWindow", () => {
  it("reproduces the documented 30s window", async () => {
    const w = wordWindow(await loadConfig());
    expect(w.ideal).toBe(74);
    expect(w.min).toBe(63);
    expect(w.max).toBe(85);
  });

  it("scales with the configured length", async () => {
    set("target_seconds", "60");
    const w = wordWindow(await loadConfig());
    expect(w.ideal).toBe(148);
    expect(w.min).toBe(126);
    expect(w.max).toBe(170);
  });

  it("follows the voice's measured rate", async () => {
    set("target_seconds", "45");
    set("tts_words_per_minute", "132");
    set("word_count_tolerance", "0.1");
    const w = wordWindow(await loadConfig());
    expect(w.ideal).toBe(99);
    expect(w.min).toBe(89);
    expect(w.max).toBe(109);
  });

  it("always leaves a usable window", async () => {
    for (const seconds of ["20", "30", "45", "60", "90"]) {
      set("target_seconds", seconds);
      const w = wordWindow(await loadConfig());
      expect(w.min, `min not below ideal at ${seconds}s`).toBeLessThan(w.ideal);
      expect(w.max, `max not above ideal at ${seconds}s`).toBeGreaterThan(w.ideal);
    }
  });
});

describe("requireSetting", () => {
  it("returns a set value", async () => {
    set("gemini_api_key", "AIzaKey");
    expect(await requireSetting("gemini_api_key")).toBe("AIzaKey");
  });

  it("throws a message that names the Settings page", async () => {
    await expect(requireSetting("gemini_api_key")).rejects.toThrow(/Settings/);
  });

  it("names the human label, not the raw key", async () => {
    await expect(requireSetting("github_dispatch_token")).rejects.toThrow(/GitHub dispatch token/);
  });
});
