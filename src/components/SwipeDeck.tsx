"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpiritualVideo } from "@/lib/types";

/** Fraction of viewport width a drag must cross to count as a decision. */
const COMMIT_FRACTION = 0.28;
/** Maximum card tilt, in degrees, at full drag. */
const MAX_TILT = 14;

type Decision = "approve" | "reject";

interface DeckMeta {
  approvedWaiting: number;
  videosPerDay: number;
  scriptsPerDay: number;
}

function estimateSeconds(video: SpiritualVideo): number | null {
  if (video.duration_seconds) return Math.round(video.duration_seconds);
  return null;
}

export function SwipeDeck({
  initialVideos,
  initialMeta,
}: {
  initialVideos: SpiritualVideo[];
  initialMeta: DeckMeta;
}) {
  const [videos, setVideos] = useState(initialVideos);
  const [meta, setMeta] = useState(initialMeta);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Drag state lives in a ref, not state: it updates on every pointermove and
  // re-rendering React at that rate makes the card stutter on a phone.
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const top = videos[0] ?? null;

  // Tell the server this card has been seen, so tomorrow's deck leads with
  // material the operator has not read yet.
  useEffect(() => {
    if (!top || top.seen_at) return;
    void fetch("/api/deck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: top.id }),
    }).catch(() => {});
  }, [top]);

  // Stop the previous card's narration when the deck moves on.
  useEffect(() => {
    audioRef.current?.pause();
  }, [top?.id]);

  const decide = useCallback(
    async (decision: Decision) => {
      if (!top || busy) return;
      setBusy(true);
      setNote(null);
      audioRef.current?.pause();

      // Remove the card immediately. Waiting for the round trip before the
      // card leaves makes the whole deck feel broken on a slow connection.
      const card = top;
      setVideos((current) => current.slice(1));
      setDragX(0);

      try {
        const response = await fetch(decision === "approve" ? "/api/approve" : "/api/reject", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: card.id }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Request failed.");

        if (decision === "approve") {
          setMeta((m) => ({ ...m, approvedWaiting: m.approvedWaiting + 1 }));
          setNote({ tone: "ok", text: `Queued: ${card.title}` });
        } else {
          setNote({ tone: "ok", text: "Rejected. It will come back for 24 hours." });
        }
      } catch (error) {
        // Put it back rather than losing the decision silently.
        setVideos((current) => [card, ...current]);
        setNote({ tone: "bad", text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    },
    [top, busy],
  );

  async function generateNow() {
    setGenerating(true);
    setNote({ tone: "ok", text: "Writing a new script… this takes about 30 seconds." });
    try {
      const response = await fetch("/api/generate", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Generation failed.");

      const refreshed = await fetch("/api/deck", { cache: "no-store" }).then((r) => r.json());
      if (refreshed.ok) {
        setVideos(refreshed.videos);
        setMeta({
          approvedWaiting: refreshed.approvedWaiting,
          videosPerDay: refreshed.videosPerDay,
          scriptsPerDay: refreshed.scriptsPerDay,
        });
      }
      setNote({ tone: "ok", text: "New script ready." });
    } catch (error) {
      setNote({ tone: "bad", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setGenerating(false);
    }
  }

  // ---- drag handling -------------------------------------------------------

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    // Let the script body scroll instead of dragging the whole card.
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    pointerStart.current = event.clientX;
    cardRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerStart.current === null) return;
    setDragX(event.clientX - pointerStart.current);
  }

  function onPointerUp() {
    if (pointerStart.current === null) return;
    const threshold = window.innerWidth * COMMIT_FRACTION;
    const travelled = dragX;
    pointerStart.current = null;

    if (travelled > threshold) void decide("approve");
    else if (travelled < -threshold) void decide("reject");
    else setDragX(0);
  }

  // Arrow keys on desktop; the deck is usable without a pointer at all.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") void decide("approve");
      if (event.key === "ArrowLeft") void decide("reject");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const dragging = pointerStart.current !== null;
  const tilt = Math.max(-1, Math.min(1, dragX / 240)) * MAX_TILT;
  const intent = dragX > 60 ? "approve" : dragX < -60 ? "reject" : null;

  // ---- empty state ---------------------------------------------------------

  if (!top) {
    return (
      <div className="pt-6">
        <Header meta={meta} />
        <div className="card mt-4 p-6 text-center">
          <p className="text-base font-bold">Nothing to review</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {meta.approvedWaiting > 0
              ? `${meta.approvedWaiting} script${meta.approvedWaiting === 1 ? "" : "s"} already approved and waiting to post.`
              : "No scripts are waiting. Write one now, or leave it to the scheduler."}
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4 px-5 py-2.5"
            onClick={generateNow}
            disabled={generating}
          >
            {generating ? "Writing…" : "Generate a script now"}
          </button>
          {note && <Note note={note} />}
        </div>
      </div>
    );
  }

  const seconds = estimateSeconds(top);
  const hookLine = top.script_body.split(/(?<=[.!?])\s+/)[0] ?? top.script_body;

  return (
    <div className="pt-6">
      <Header meta={meta} />

      <div className="deck mt-3">
        <div
          ref={cardRef}
          className="card deck__card p-5"
          style={{
            transform: `translateX(${dragX}px) rotate(${tilt}deg)`,
            transition: dragging ? "none" : "transform 0.22s ease",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {intent && (
            <span
              className={`deck__stamp deck__stamp--${intent}`}
              style={{ opacity: Math.min(1, Math.abs(dragX) / 160) }}
            >
              {intent === "approve" ? "QUEUE" : "REJECT"}
            </span>
          )}

          {/* The first line decides the video, so it is what the eye hits. */}
          <p className="deck__hook">{hookLine}</p>

          {top.audio_url && (
            <audio
              ref={audioRef}
              data-no-drag
              controls
              preload="none"
              src={top.audio_url}
              className="mt-3 w-full"
            />
          )}

          <div className="chip-row mt-3">
            {seconds && <span className="chip">{seconds}s</span>}
            <span className="chip">{top.word_count ?? "?"} words</span>
            {top.status === "rejected" && <span className="chip">seen before</span>}
            {typeof top.max_similarity === "number" && top.max_similarity > 0.3 && (
              <span className="chip">{Math.round(top.max_similarity * 100)}% similar</span>
            )}
          </div>

          <div data-no-drag className="deck__body mt-3">
            {top.script_body}
          </div>

          <p className="mt-3 text-sm font-semibold">{top.title}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {top.hashtags?.join(" ")}
          </p>

          <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {top.scripture} — {top.reference}
            {top.citation_url && (
              <>
                {" · "}
                <a data-no-drag href={top.citation_url} target="_blank" rel="noreferrer">
                  verify
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {note && <Note note={note} />}

      <div className="sticky-bar flex items-center gap-3">
        <button
          type="button"
          className="btn btn-danger flex-1 py-2.5"
          onClick={() => decide("reject")}
          disabled={busy}
        >
          Reject
        </button>
        <button
          type="button"
          className="btn btn-ghost px-3 py-2.5"
          onClick={generateNow}
          disabled={generating}
          title="Write one more script now"
        >
          {generating ? "…" : "+"}
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1 py-2.5"
          onClick={() => decide("approve")}
          disabled={busy}
        >
          Queue it
        </button>
      </div>
    </div>
  );
}

function Header({ meta }: { meta: DeckMeta }) {
  return (
    <div className="flex items-baseline justify-between">
      <h1 className="text-xl font-extrabold">Review</h1>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {meta.approvedWaiting} queued · {meta.videosPerDay}/day
      </span>
    </div>
  );
}

function Note({ note }: { note: { tone: "ok" | "bad"; text: string } }) {
  return (
    <p
      className="wrap-anywhere mt-3 text-xs"
      style={{ color: note.tone === "ok" ? "var(--success)" : "var(--danger)" }}
    >
      {note.text}
    </p>
  );
}
