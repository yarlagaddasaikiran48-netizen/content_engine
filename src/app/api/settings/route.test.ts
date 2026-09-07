import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaskedSetting } from "@/lib/settings/store";

const written: Array<Record<string, string>> = [];

const MASKED: MaskedSetting[] = [
  {
    key: "gemini_api_key",
    group: "connections",
    label: "Gemini API key",
    kind: "password",
    secret: true,
    value: null,
    isSet: true,
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    key: "scripts_per_day",
    group: "writing",
    label: "Scripts generated per day",
    kind: "number",
    secret: false,
    value: "8",
    isSet: true,
    updatedAt: "2026-09-01T00:00:00.000Z",
    min: 1,
    max: 30,
  },
];

vi.mock("@/lib/settings/store", () => ({
  maskedSettings: async () => MASKED,
  writeSettings: async (updates: Record<string, string>) => {
    if (Object.keys(updates).some((k) => k === "not_a_setting")) {
      throw new Error('Unknown setting "not_a_setting". Add it to SETTING_DEFS first.');
    }
    written.push(updates);
  },
}));

const { GET, POST } = await import("@/app/api/settings/route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  written.length = 0;
});

describe("GET /api/settings", () => {
  it("returns the masked catalogue", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.settings).toHaveLength(2);
  });

  it("never carries a secret value in the payload", async () => {
    const raw = await (await GET()).text();
    expect(raw).not.toContain("AIza");
    expect(JSON.parse(raw).settings[0].value).toBeNull();
    expect(JSON.parse(raw).settings[0].isSet).toBe(true);
  });
});

describe("POST /api/settings", () => {
  it("saves a valid partial update", async () => {
    const response = await POST(post({ updates: { scripts_per_day: "12" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.saved).toBe(1);
    expect(written[0]).toEqual({ scripts_per_day: "12" });
  });

  it("rejects a missing updates object", async () => {
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/object of setting keys/i);
  });

  it("rejects an array in place of an object", async () => {
    const response = await POST(post({ updates: ["scripts_per_day"] }));
    expect(response.status).toBe(400);
  });

  it("rejects an empty update", async () => {
    const response = await POST(post({ updates: {} }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/no settings/i);
  });

  it("rejects a non-string value rather than coercing it", async () => {
    const response = await POST(post({ updates: { scripts_per_day: 12 } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/must be a string/i);
    expect(written).toHaveLength(0);
  });

  it("surfaces an unknown key as a 400 naming the key", async () => {
    const response = await POST(post({ updates: { not_a_setting: "x" } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/unknown setting/i);
  });

  it("rejects a malformed body without throwing", async () => {
    const bad = new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });
});
