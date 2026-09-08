"use client";

import { useEffect, useMemo, useState } from "react";
import type { LearningBrief } from "@/lib/learning/insights";
import type { PerformanceRow } from "@/app/api/performance/route";

/**
 * The Performance page.
 *
 * Deliberately not a YouTube Studio clone. Studio already exists, is better at
 * charts, and is on the same phone. The only reason for this page is the thing
 * Studio cannot do: put a video's numbers next to the decisions that produced
 * it — which god, which register, which opening line — and then say out loud
 * what the engine has concluded and will write differently because of it.
 *
 * So the ordering is: what the channel did, what the channel learned, then the
 * videos. The middle section is the point of the page.
 */

export interface PerformanceData {
  published: number;
  measured: number;
  needsForLearning: number;
  learningEnabled: boolean;
  youtubeConnected: boolean;
  schemaError: string | null;
  totals: {
    views: number;
    engagedViews: number;
    likes: number;
    comments: number;
    shares: number;
    subscribersGained: number;
    hookRetention: number | null;
    completion: number | null;
  };
  brief: LearningBrief | null;
  rows: PerformanceRow[];
}

type Sort = "newest" | "best" | "worst";

/** 12,400 rather than 12400, and "—" rather than a lying zero. */
function count(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-IN");
}

/** Retention arrives as a 0–1 ratio; completion arrives already as a percentage. */
function ratioPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function PerformanceClient({
  initial,
  loadError,
}: {
  initial: PerformanceData | null;
  loadError: string | null;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(loadError);
  const [sort, setSort] = useState<Sort>("newest");
  const [refreshing, setRefreshing] = useState(false);

  // The server render can be a few minutes stale by the time a phone unlocks.
  useEffect(() => {
    if (initial) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setRefreshing(true);
    try {
      const body = await fetch("/api/performance", { cache: "no-store" }).then((r) => r.json());
      if (!body.ok) throw new Error(body.error ?? "Could not load performance.");
      setData(body as PerformanceData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const copy = [...data.rows];
    if (sort === "newest") {
      return copy.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }
    // Unmeasured videos have no place in a ranking, so they sink to the bottom
    // of both orderings rather than counting as the worst.
    const rank = (row: PerformanceRow) => (row.score === null ? -1 : row.score);
    return copy.sort((a, b) =>
      sort === "best" ? rank(b) - rank(a) : (a.score === null ? 2 : 0) - (b.score === null ? 2 : 0) || rank(a) - rank(b),
    );
  }, [data, sort]);

  if (error && !data) {
    return (
      <div className="card p-4">
        <p className="text-sm font-semibold">Performance could not load.</p>
        <p className="mt-2 text-sm wrap-anywhere" style={{ color: "var(--text-muted)" }}>
          {error}
        </p>
        <button className="btn btn-ghost mt-3 px-3 py-2" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <div className="spinner" aria-label="Loading" />;

  const { totals, brief } = data;
  const blocked = data.rows.find((row) => row.error)?.error ?? null;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Performance</h1>
        <button
          className="btn btn-ghost px-3 py-1 text-xs"
          onClick={() => void reload()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {!data.youtubeConnected && (
        <div className="card p-3 text-sm">
          <strong>YouTube is not connected.</strong> Nothing can be measured until it is —
          open Settings and press Connect YouTube.
        </div>
      )}

      {data.schemaError && (
        <div className="card p-3 text-sm">
          <strong>The performance columns are missing.</strong> Run
          <code className="mx-1">supabase/migrations/005_performance_and_learning.sql</code>
          in the Supabase SQL editor, then refresh.
          <div className="mt-2 text-xs wrap-anywhere" style={{ color: "var(--text-faint)" }}>
            {data.schemaError}
          </div>
        </div>
      )}

      {blocked && !data.schemaError && (
        <div className="card p-3 text-sm wrap-anywhere">
          <strong>YouTube would not answer.</strong>
          <div className="mt-1" style={{ color: "var(--text-muted)" }}>
            {blocked}
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Tile
          label="Views"
          value={count(totals.views)}
          hint={`${data.published} published`}
        />
        <Tile
          label="Held past 3s"
          value={ratioPercent(totals.hookRetention)}
          hint="the hook, measured"
        />
        <Tile label="Watched to" value={percent(totals.completion)} hint="of the video" />
        <Tile
          label="Subscribers"
          value={count(totals.subscribersGained)}
          hint={`${count(totals.likes)} likes · ${count(totals.shares)} shares`}
        />
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">What the engine has learned</h2>

        {!data.learningEnabled ? (
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Learning is switched off in Settings, so these numbers are being collected but
            not used. Turn on “Learn from retention” to feed them back into the writing.
          </p>
        ) : brief ? (
          <>
            {brief.findings.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {brief.findings.map((finding) => (
                  <li key={finding} style={{ color: "var(--text-muted)" }}>
                    {finding}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                {brief.sampleSize} videos measured, but no difference between them is large
                enough to act on yet. That is a real answer, not a missing one — nothing here
                is being invented to fill the space.
              </p>
            )}

            {brief.strongestHooks.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold">Openings that held people</div>
                <ul className="mt-1 flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {brief.strongestHooks.map((hook) => (
                    <li key={hook} className="wrap-anywhere">
                      {hook}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {data.measured === 0
              ? "Nothing measured yet. Numbers appear a few hours after the first video goes live."
              : `${data.measured} videos measured. ${data.needsForLearning} more and the engine starts writing against your own retention instead of general rules.`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="chip-row">
          {(["newest", "best", "worst"] as const).map((option) => (
            <button
              key={option}
              className={`chip${sort === option ? " is-active" : ""}`}
              onClick={() => setSort(option)}
              aria-pressed={sort === option}
            >
              {option === "newest" ? "Newest" : option === "best" ? "Best first" : "Worst first"}
            </button>
          ))}
        </div>

        {rows.length === 0 && (
          <div className="card p-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing published yet.
          </div>
        )}

        {rows.map((row) => (
          <article key={row.id} className="card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold wrap-anywhere">{row.title}</span>
              <span className="shrink-0 text-xs" style={{ color: "var(--text-faint)" }}>
                {shortDate(row.publishedAt)}
              </span>
            </div>

            {row.hook && (
              <p className="mt-1 text-xs wrap-anywhere" style={{ color: "var(--text-muted)" }}>
                {row.hook}
              </p>
            )}

            <div className="chip-row mt-2">
              <span className="chip">{count(row.views)} views</span>
              <span className="chip">{ratioPercent(row.hookRetention)} past 3s</span>
              <span className="chip">{percent(row.completion)} watched</span>
              {row.deity && <span className="chip">{row.deity}</span>}
              {row.tone && <span className="chip">{row.tone}</span>}
            </div>

            {row.score !== null && (
              <div
                className="mt-2 h-1 w-full overflow-hidden rounded"
                style={{ background: "var(--bg-sunken)" }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded"
                  style={{ width: `${Math.round(row.score * 100)}%`, background: "var(--accent)" }}
                />
              </div>
            )}

            {row.youtubeUrl && (
              <a
                className="mt-2 inline-block text-xs underline"
                href={row.youtubeUrl}
                target="_blank"
                rel="noreferrer"
              >
                Watch on YouTube
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
