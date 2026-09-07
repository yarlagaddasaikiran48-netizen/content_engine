import { SwipeDeck } from "@/components/SwipeDeck";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The review deck is the home screen. Server-rendered so the first card is
 * already there on open — a spinner between the operator and the first
 * decision is the difference between reviewing eight scripts and reviewing
 * none.
 */
export default async function ReviewPage() {
  let videos: SpiritualVideo[] = [];
  let approvedWaiting = 0;
  let videosPerDay = 2;
  let scriptsPerDay = 8;
  let setupError: string | null = null;

  try {
    const cfg = await loadConfig();
    videosPerDay = cfg.videosPerDay;
    scriptsPerDay = cfg.scriptsPerDay;

    const supabase = supabaseAdmin();
    const now = new Date().toISOString();

    const [{ data: rows, error }, { count }] = await Promise.all([
      supabase
        .from("spiritual_videos")
        .select("*")
        .in("status", ["pending", "rejected"])
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("status", { ascending: true })
        .order("seen_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true })
        .limit(60),
      supabase
        .from("spiritual_videos")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
    ]);

    if (error) throw new Error(error.message);
    videos = (rows ?? []) as SpiritualVideo[];
    approvedWaiting = count ?? 0;
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  if (setupError) {
    return (
      <div className="app-shell pt-10">
        <div className="card p-6">
          <h1 className="text-lg font-extrabold">Setup needed</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            The deck could not reach Supabase:
          </p>
          <pre
            className="wrap-anywhere mt-3 rounded-lg p-3 text-xs whitespace-pre-wrap"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            {setupError}
          </pre>
          <ol
            className="mt-4 list-decimal space-y-1.5 pl-5 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <li>
              Put the two Supabase values in <code>.env.local</code>.
            </li>
            <li>
              Run <code>supabase/schema.sql</code>, then every file in{" "}
              <code>supabase/migrations/</code> in order.
            </li>
            <li>
              Run <code>npm run seed:topics</code> to load the scripture ledger.
            </li>
            <li>Restart the dev server.</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SwipeDeck
        initialVideos={videos}
        initialMeta={{ approvedWaiting, videosPerDay, scriptsPerDay }}
      />
    </div>
  );
}
