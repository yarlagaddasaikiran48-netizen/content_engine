import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one thing a reject has to guarantee: the verse never comes back.
 *
 * It is burned once already, by the generator, in a call that happens after
 * the insert and can therefore fail on its own. This route burns it again so
 * that a rejected story is gone even when that first call did not land.
 */

const rpcCalls: Array<{ fn: string; args: unknown }> = [];
let updated: Record<string, unknown> | null = null;
let row: Record<string, unknown> | null = null;

vi.mock("@/lib/settings/config", () => ({
  loadConfig: async () => ({ rejectTtlHours: 24 }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        updated = patch;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "v1", ...patch }, error: null }),
            }),
          }),
        };
      },
    }),
  }),
}));

const post = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new Request("http://x/api/reject", { method: "POST", body: JSON.stringify(body) }));
};

describe("POST /api/reject", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    updated = null;
    row = { id: "v1", status: "pending", audio_path: null, topic_key: "gita:2.47" };
  });

  it("spends the verse so the same story cannot be written again", async () => {
    const response = await post({ id: "v1" });

    expect(response.status).toBe(200);
    expect(rpcCalls).toEqual([{ fn: "consume_topic", args: { p_topic_key: "gita:2.47" } }]);
  });

  it("never hands the verse back to the pool", async () => {
    await post({ id: "v1" });

    expect(rpcCalls.map((c) => c.fn)).not.toContain("release_topic");
  });

  it("marks the row rejected and gives it a deletion time", async () => {
    await post({ id: "v1", reason: "flat ending" });

    expect(updated).toMatchObject({ status: "rejected", rejection_reason: "flat ending" });
    expect(new Date(String(updated?.expires_at)).getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to reject something already on the channel", async () => {
    row = { id: "v1", status: "published", audio_path: null, topic_key: "gita:2.47" };

    const response = await post({ id: "v1" });

    expect(response.status).toBe(409);
    expect(rpcCalls).toEqual([]);
  });
});
