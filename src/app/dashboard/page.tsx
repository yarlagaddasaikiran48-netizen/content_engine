import { QueueClient } from "@/components/QueueClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { QueueStats, SpiritualVideo } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The dashboard is a server component so the first paint already contains the
 * queue — no spinner on open, which matters on a phone connection. Interaction
 * is handed to QueueClient from there.
 */
export default async function DashboardPage() {
  let videos: SpiritualVideo[] = [];
  let stats: QueueStats | null = null;
  let setupError: string | null = null;

  try {
    const supabase = supabaseAdmin();

    const [{ data: rows, error }, { data: statsRow }] = await Promise.all([
      supabase
        .from("spiritual_videos")
        .select("*")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("queue_stats").select("*").maybeSingle(),
    ]);

    if (error) throw new Error(error.message);
    videos = (rows ?? []) as SpiritualVideo[];
    stats = (statsRow ?? null) as QueueStats | null;
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  if (setupError) {
    return (
      <div className="app-shell pt-10">
        <div className="card p-6">
          <h1 className="text-lg font-extrabold">Setup needed</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            The dashboard could not reach Supabase:
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
              Copy <code>.env.example</code> to <code>.env.local</code> and fill in the
              Supabase URL, anon key and service-role key.
            </li>
            <li>
              Run <code>supabase/schema.sql</code> in the Supabase SQL editor.
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
      <QueueClient initialVideos={videos} initialStats={stats} />
    </div>
  );
}
