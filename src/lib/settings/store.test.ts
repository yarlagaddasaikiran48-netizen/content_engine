import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  key: string;
  value_enc: string | null;
  is_secret: boolean;
  updated_at: string;
}

const rows = new Map<string, Row>();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: async () => ({ data: [...rows.values()], error: null }),
      upsert: async (payload: Row[]) => {
        for (const row of payload) rows.set(row.key, { ...row });
        return { error: null };
      },
    }),
  }),
}));

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

const { invalidateSettingsCache, maskedSettings, readRawSettings, writeSettings } = await import(
  "@/lib/settings/store"
);

beforeEach(() => {
  rows.clear();
  invalidateSettingsCache();
});

describe("writeSettings / readRawSettings", () => {
  it("round-trips a non-secret in clear text", async () => {
    await writeSettings({ scripts_per_day: "12" });
    expect(rows.get("scripts_per_day")!.value_enc).toBe("12");
    expect(rows.get("scripts_per_day")!.is_secret).toBe(false);
    expect((await readRawSettings()).get("scripts_per_day")!.value).toBe("12");
  });

  it("round-trips a secret without ever storing the plaintext", async () => {
    await writeSettings({ gemini_api_key: "AIzaSyRealLookingKey" });
    expect(rows.get("gemini_api_key")!.value_enc).not.toContain("AIzaSy");
    expect(rows.get("gemini_api_key")!.is_secret).toBe(true);
    expect((await readRawSettings()).get("gemini_api_key")!.value).toBe("AIzaSyRealLookingKey");
  });

  it("stores cron_secret unencrypted so SQL can read it", async () => {
    await writeSettings({ cron_secret: "tick-secret-123" });
    expect(rows.get("cron_secret")!.value_enc).toBe("tick-secret-123");
    expect(rows.get("cron_secret")!.is_secret).toBe(false);
  });

  it("clears a value when handed an empty string", async () => {
    await writeSettings({ gemini_api_key: "something" });
    await writeSettings({ gemini_api_key: "" });
    expect(rows.get("gemini_api_key")!.value_enc).toBeNull();
    expect((await readRawSettings()).get("gemini_api_key")!.value).toBeNull();
  });

  it("trims surrounding whitespace, which pasted keys usually carry", async () => {
    await writeSettings({ github_owner: "  someone  " });
    expect(rows.get("github_owner")!.value_enc).toBe("someone");
  });

  it("rejects an unknown key rather than storing junk", async () => {
    await expect(writeSettings({ not_a_setting: "x" })).rejects.toThrow(/unknown setting/i);
  });

  it("survives a row whose ciphertext no longer decrypts", async () => {
    rows.set("gemini_api_key", {
      key: "gemini_api_key",
      value_enc: "bm90LXZhbGlkLWNpcGhlcnRleHQ=",
      is_secret: true,
      updated_at: new Date().toISOString(),
    });
    const read = await readRawSettings();
    expect(read.get("gemini_api_key")!.value).toBeNull();
  });

  it("caches reads and refreshes after a write", async () => {
    await writeSettings({ tts_voice: "voice-one" });
    expect((await readRawSettings()).get("tts_voice")!.value).toBe("voice-one");
    await writeSettings({ tts_voice: "voice-two" });
    expect((await readRawSettings()).get("tts_voice")!.value).toBe("voice-two");
  });
});

describe("maskedSettings", () => {
  it("never returns a secret value but does say it is set", async () => {
    await writeSettings({ gemini_api_key: "AIzaSyRealLookingKey" });
    const masked = await maskedSettings();
    const gemini = masked.find((m) => m.key === "gemini_api_key")!;
    expect(gemini.value).toBeNull();
    expect(gemini.isSet).toBe(true);
    expect(JSON.stringify(masked)).not.toContain("AIzaSy");
  });

  it("returns non-secret values in clear so the form can show them", async () => {
    await writeSettings({ tts_voice: "en-IN-PrabhatNeural" });
    const masked = await maskedSettings();
    expect(masked.find((m) => m.key === "tts_voice")!.value).toBe("en-IN-PrabhatNeural");
  });

  it("returns one entry per catalogue setting even when nothing is stored", async () => {
    const { SETTING_DEFS } = await import("@/lib/settings/catalogue");
    expect((await maskedSettings()).length).toBe(SETTING_DEFS.length);
  });

  it("reports an unset secret as not set", async () => {
    const masked = await maskedSettings();
    expect(masked.find((m) => m.key === "gemini_api_key")!.isSet).toBe(false);
  });

  it("shows the effective value of an unset non-secret, not a blank", async () => {
    // A blank field beside an engine happily using "gemini-2.5-flash" reads as
    // broken, and invites the operator to retype a value that already applies.
    const masked = await maskedSettings();
    const model = masked.find((m) => m.key === "gemini_model")!;
    expect(model.value).toBe("gemini-2.5-flash");
    expect(model.isSet).toBe(false);
  });

  it("still distinguishes a stored value from a fallback", async () => {
    await writeSettings({ gemini_model: "gemini-2.5-pro" });
    const model = (await maskedSettings()).find((m) => m.key === "gemini_model")!;
    expect(model.value).toBe("gemini-2.5-pro");
    expect(model.isSet).toBe(true);
  });

  it("carries the catalogue metadata the form needs to render", async () => {
    const target = (await maskedSettings()).find((m) => m.key === "target_seconds")!;
    expect(target.kind).toBe("number");
    expect(target.min).toBe(20);
    expect(target.max).toBe(90);
    expect(target.group).toBe("writing");
  });
});
