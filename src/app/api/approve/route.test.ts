import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Approve is the first transition in the pipeline, and it was refusing
 * everything.
 *
 * The route required `audio_url` to be set. That was right while the narration
 * was recorded at generation time; it stopped being right when recording moved
 * to the renderer, which runs *after* approval, and the check was left behind.
 * Every freshly generated row has no audio by construction, so every approve
 * returned 422 "This video has no audio" and nothing ever reached the queue.
 *
 * These tests pin the shape of the fix: a pending row with no audio is exactly
 * the normal case and must be approved.
 */

const dispatched: unknown[] = [];
let row: Record<string, unknown> | null = null;
let updated: Record<string, unknown> | null = null;

vi.mock("@/lib/settings/config", () => ({
  loadConfig: async () => ({
    githubOwner: "owner",
    githubRepo: "repo",
    githubDispatchToken: "token",
    siteUrl: "https://example.test",
  }),
}));

vi.mock("@/lib/github/dispatch", () => ({
  dispatchRender: async (payload: unknown) => {
    dispatched.push(payload);
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        updated = patch;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { ...row, ...patch }, error: null }),
            }),
          }),
        };
      },
    }),
  }),
}));

const post = async (id: string) => {
  const { POST } = await import("./route");
  return POST(
    new Request("http://x/api/approve", { method: "POST", body: JSON.stringify({ id }) }),
  );
};

describe("POST /api/approve", () => {
  beforeEach(() => {
    dispatched.length = 0;
    updated = null;
    row = { id: "v1", status: "pending", audio_url: null, title: "An episode" };
  });

  it("approves a freshly generated script, which by design has no audio yet", async () => {
    const response = await post("v1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(updated).toMatchObject({ status: "approved" });
  });

  it("hands the row to the renderer, which is what records the narration", async () => {
    await post("v1");

    expect(dispatched).toEqual([
      { video_id: "v1", callback_url: "https://example.test/api/publish/callback" },
    ]);
  });

  it("clears a previous error so a retried row does not carry it forward", async () => {
    row = { id: "v1", status: "failed", audio_url: null, title: "An episode" };

    await post("v1");

    expect(updated).toMatchObject({ status: "approved", error_message: null });
  });

  it("still refuses a row that has already moved on", async () => {
    row = { id: "v1", status: "ready", audio_url: null, title: "An episode" };

    const response = await post("v1");

    expect(response.status).toBe(409);
    expect(dispatched).toEqual([]);
  });

  it("refuses an unknown id", async () => {
    row = null;

    const response = await post("missing");

    expect(response.status).toBe(404);
  });
});
