"use client";

import { useState } from "react";
import type { QueueData } from "@/lib/schedule/queue";

/**
 * The publish line.
 *
 * This page exists because approve and publish became separate events. A queue
 * nobody can look at is a queue nobody controls: no way to see what goes out
 * tonight, no way to reorder it, and a failed render that nobody notices until
 * the slot has passed.
 */
export function PublishQueue({ initial, loadError }: { initial: QueueData; loadError: string | null }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function refresh() {
    const body = await fetch("/api/queue", { cache: "no-store" }).then((r) => r.json());
    if (body.ok) {
      setData({
        waiting: body.waiting,
        inFlight: body.inFlight,
        postingTimes: body.postingTimes,
        timezone: body.timezone,
        videosPerDay: body.videosPerDay,
      });
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...data.waiting];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    // Re-label optimistically: position N always gets slot N, so the labels
    // simply follow the new order.
    const labels = data.waiting.map((e) => e.when);
    setData({ ...data, waiting: next.map((e, i) => ({ ...e, when: labels[i] })) });

    setBusy("reorder");
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: next.map((e) => e.video.id) }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Reorder failed.");
      await refresh();
    } catch (error) {
      setNote({ tone: "bad", text: error instanceof Error ? error.message : String(error) });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function unqueue(id: string) {
    setBusy(id);
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "unqueue" }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Could not unqueue.");
      setNote({ tone: "ok", text: "Sent back to the review deck." });
      await refresh();
    } catch (error) {
      setNote({ tone: "bad", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function retry(id: string) {
    setBusy(id);
    try {
      const response = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Retry failed.");
      setNote({ tone: "ok", text: body.message ?? "Retrying." });
      await refresh();
    } catch (error) {
      setNote({ tone: "bad", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="card mt-6 p-5">
        <h1 className="text-lg font-extrabold">Queue unavailable</h1>
        <pre
          className="wrap-anywhere mt-3 rounded-lg p-3 text-xs whitespace-pre-wrap"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {loadError}
        </pre>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-extrabold">Queue</h1>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {data.videosPerDay}/day · {data.postingTimes.join(", ")} {data.timezone.split("/")[1]}
        </span>
      </div>

      {note && (
        <p
          className="wrap-anywhere mt-2 text-xs"
          style={{ color: note.tone === "ok" ? "var(--success)" : "var(--danger)" }}
        >
          {note.text}
        </p>
      )}

      {data.inFlight.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
            In flight
          </h2>
          {data.inFlight.map((video) => (
            <div key={video.id} className="card mt-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{video.title}</p>
                <span
                  className="chip shrink-0"
                  style={
                    video.status === "failed"
                      ? { color: "var(--danger)", borderColor: "var(--danger)" }
                      : undefined
                  }
                >
                  {video.status}
                </span>
              </div>
              {video.error_message && (
                <p className="wrap-anywhere mt-2 text-xs" style={{ color: "var(--danger)" }}>
                  {video.error_message}
                </p>
              )}
              {video.status === "failed" && (
                <button
                  type="button"
                  className="btn btn-ghost mt-3 px-4 py-2"
                  onClick={() => retry(video.id)}
                  disabled={busy === video.id}
                >
                  {busy === video.id ? "Retrying…" : "Retry"}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="mt-4">
        <h2 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
          Waiting to post ({data.waiting.length})
        </h2>

        {data.waiting.length === 0 && (
          <div className="card mt-2 p-5 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing queued. Approve some scripts on the Review tab and they will line up here.
            </p>
          </div>
        )}

        {data.waiting.map((entry, index) => (
          <div key={entry.video.id} className="card mt-2 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                {entry.when}
              </span>
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                #{index + 1}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold">{entry.video.title}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {entry.video.scripture} — {entry.video.reference}
              {entry.video.duration_seconds
                ? ` · ${Math.round(entry.video.duration_seconds)}s`
                : ""}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5"
                onClick={() => move(index, -1)}
                disabled={index === 0 || busy !== null}
                aria-label="Move earlier"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5"
                onClick={() => move(index, 1)}
                disabled={index === data.waiting.length - 1 || busy !== null}
                aria-label="Move later"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-danger px-3 py-1.5"
                onClick={() => unqueue(entry.video.id)}
                disabled={busy !== null}
              >
                Back to deck
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
