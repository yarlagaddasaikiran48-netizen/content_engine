"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VideoCard } from "@/components/VideoCard";
import type { QueueStats, SpiritualVideo } from "@/lib/types";

type Filter = "pending" | "published" | "all" | "archive";

const FILTERS: Array<{ id: Filter; label: string; statuses: string }> = [
  { id: "pending", label: "To review", statuses: "pending,failed" },
  { id: "published", label: "Live", statuses: "approved,rendering,published" },
  { id: "archive", label: "Rejected", statuses: "rejected" },
  { id: "all", label: "Everything", statuses: "all" },
];

interface ToastState {
  message: string;
  tone: "success" | "error" | "info";
}

interface Props {
  initialVideos: SpiritualVideo[];
  initialStats: QueueStats | null;
}

export function QueueClient({ initialVideos, initialStats }: Props) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [videos, setVideos] = useState<SpiritualVideo[]>(initialVideos);
  const [stats, setStats] = useState<QueueStats | null>(initialStats);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirming, setConfirming] = useState<SpiritualVideo | null>(null);
  const [rejecting, setRejecting] = useState<SpiritualVideo | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [failure, setFailure] = useState<{ message: string; log: string[] } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, tone: ToastState["tone"] = "info") => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5_000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const load = useCallback(
    async (target: Filter, showSpinner = true) => {
      const definition = FILTERS.find((item) => item.id === target) ?? FILTERS[0];
      if (showSpinner) setRefreshing(true);
      try {
        const response = await fetch(`/api/videos?status=${definition.statuses}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!payload.ok) throw new Error(payload.error ?? "Could not load the queue.");
        setVideos(payload.videos as SpiritualVideo[]);
        setStats((payload.stats as QueueStats | null) ?? null);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not load the queue.", "error");
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [notify],
  );

  const changeFilter = useCallback(
    (next: Filter) => {
      setFilter(next);
      void load(next);
    },
    [load],
  );

  /* A render takes a couple of minutes on GitHub Actions, so poll quietly
     while anything is mid-flight — and stop as soon as nothing is. */
  const hasInFlight = useMemo(
    () => videos.some((video) => video.status === "approved" || video.status === "rendering"),
    [videos],
  );

  useEffect(() => {
    if (!hasInFlight) return;
    const interval = setInterval(() => void load(filter, false), 20_000);
    return () => clearInterval(interval);
  }, [hasInFlight, filter, load]);

  const generate = useCallback(async () => {
    setGenerating(true);
    notify("Writing a new script… this takes about 20 seconds.", "info");
    try {
      const response = await fetch("/api/generate", { method: "POST" });
      const payload = await response.json();
      if (!payload.ok) {
        // The generator's own message ends with "see the log above", and the
        // log is right here in the payload — so show it. A toast that clears
        // itself after five seconds is not a log, and a phone has no console
        // to fall back to.
        const lines: string[] = Array.isArray(payload.log) ? payload.log : [];
        if (lines.length > 0) {
          setFailure({ message: payload.error ?? "Generation failed.", log: lines });
          return;
        }
        throw new Error(payload.error ?? "Generation failed.");
      }
      notify(`Created “${payload.video.title}”`, "success");
      setFilter("pending");
      await load("pending", false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Generation failed.", "error");
    } finally {
      setGenerating(false);
    }
  }, [load, notify]);

  const approve = useCallback(
    async (video: SpiritualVideo) => {
      setConfirming(null);
      setBusyId(video.id);
      try {
        const response = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: video.id }),
        });
        const payload = await response.json();
        if (!payload.ok) throw new Error(payload.error ?? "Approval failed.");
        notify(payload.message ?? "Approved and sent to the renderer.", "success");
        await load(filter, false);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Approval failed.", "error");
      } finally {
        setBusyId(null);
      }
    },
    [filter, load, notify],
  );

  const reject = useCallback(async () => {
    const video = rejecting;
    if (!video) return;
    setRejecting(null);
    setBusyId(video.id);
    try {
      const response = await fetch("/api/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: video.id, reason: rejectReason.trim() || undefined }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error ?? "Rejection failed.");
      notify("Rejected. It will not come back.", "info");
      setRejectReason("");
      await load(filter, false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Rejection failed.", "error");
    } finally {
      setBusyId(null);
    }
  }, [filter, load, notify, rejectReason, rejecting]);

  const toneStyles: Record<ToastState["tone"], { background: string; color: string }> = {
    success: { background: "var(--success-soft)", color: "var(--success)" },
    error: { background: "var(--danger-soft)", color: "var(--danger)" },
    info: { background: "var(--bg-elevated)", color: "var(--text)" },
  };

  return (
    <>
      {/* ---- header ---- */}
      <header
        className="sticky top-0 z-30 -mx-4 mb-4 px-4 pb-3"
        style={{
          paddingTop: "calc(16px + var(--safe-top))",
          background: "color-mix(in srgb, var(--bg) 92%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-tight font-extrabold">
              Spiritual Content Engine
            </h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {stats
                ? `${stats.pending} to review · ${stats.published} live · ${stats.topics_remaining} topics left`
                : "Approval queue"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(filter)}
            aria-label="Refresh queue"
            className="btn btn-ghost shrink-0 px-3"
            disabled={refreshing}
          >
            {refreshing ? <span className="spinner" /> : "↻"}
          </button>
        </div>

        <nav className="chip-row mt-3" aria-label="Filter queue">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip"
              data-active={filter === item.id}
              onClick={() => changeFilter(item.id)}
            >
              {item.label}
              {item.id === "pending" && stats && stats.pending > 0 && (
                <span className="font-bold">{stats.pending}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* ---- list ---- */}
      <main className="flex flex-col gap-4">
        {videos.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-base font-bold">Nothing here yet</p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {filter === "pending"
                ? "The queue is clear. Generate a script to get started."
                : "No videos match this filter."}
            </p>
            {filter === "pending" && (
              <button
                type="button"
                className="btn btn-primary mt-1 px-5"
                onClick={() => void generate()}
                disabled={generating}
              >
                {generating ? <span className="spinner" /> : null}
                Generate today&apos;s script
              </button>
            )}
          </div>
        ) : (
          videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              busy={busyId === video.id}
              onApprove={setConfirming}
              onReject={(item) => {
                setRejectReason("");
                setRejecting(item);
              }}
            />
          ))
        )}
      </main>

      {/* ---- sticky generate bar ---- */}
      <div className="sticky-bar">
        <div className="mx-auto flex max-w-[680px] gap-2">
          <button
            type="button"
            className="btn btn-primary flex-1"
            style={{ minHeight: 50 }}
            onClick={() => void generate()}
            disabled={generating}
          >
            {generating ? (
              <>
                <span className="spinner" />
                Writing…
              </>
            ) : (
              "Generate new script"
            )}
          </button>
        </div>
      </div>

      {/* ---- approve confirmation ---- */}
      {confirming && (
        <Sheet onClose={() => setConfirming(null)} labelledBy="approve-heading">
          <h2 id="approve-heading" className="text-base font-bold">
            Publish to YouTube?
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            This renders the video and uploads it to your channel as{" "}
            <strong style={{ color: "var(--text)" }}>{confirming.title}</strong>. It
            goes live publicly and cannot be undone from here.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 48 }}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 48 }}
              onClick={() => void approve(confirming)}
            >
              Yes, publish
            </button>
          </div>
        </Sheet>
      )}

      {/* ---- reject sheet ---- */}
      {rejecting && (
        <Sheet onClose={() => setRejecting(null)} labelledBy="reject-heading">
          <h2 id="reject-heading" className="text-base font-bold">
            Reject this script?
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Optional — noting why helps you spot patterns later.
          </p>
          <input
            type="text"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="e.g. hook is weak"
            className="mt-3 w-full rounded-lg px-3 py-3"
            style={{
              background: "var(--bg-sunken)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
            }}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 48 }}
              onClick={() => setRejecting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{ minHeight: 48 }}
              onClick={() => void reject()}
            >
              Reject
            </button>
          </div>
        </Sheet>
      )}

      {/* ---- why generation failed ---- */}
      {failure && (
        <Sheet onClose={() => setFailure(null)} labelledBy="failure-heading">
          <h2 id="failure-heading" className="text-base font-bold">
            No script passed the checks
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {failure.message}
          </p>
          {/* Selectable, not a toast: the reason for each rejected attempt is
              the one thing worth copying out of this screen. */}
          <pre
            className="mt-3 max-h-[45vh] overflow-auto rounded-lg p-3 text-xs"
            style={{
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              userSelect: "text",
            }}
          >
            {failure.log.join("\n")}
          </pre>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 48 }}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(failure.log.join("\n"))
                  .then(() => notify("Log copied.", "success"))
                  .catch(() => notify("Could not copy — select the text instead.", "error"));
              }}
            >
              Copy log
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 48 }}
              onClick={() => setFailure(null)}
            >
              Close
            </button>
          </div>
        </Sheet>
      )}

      {/* ---- toast ---- */}
      {toast && (
        <div className="toast" role="status" aria-live="polite" style={toneStyles[toast.tone]}>
          {toast.message}
        </div>
      )}
    </>
  );
}

/**
 * Bottom sheet. On a phone, a dialog anchored to the bottom is reachable with
 * a thumb; a centred modal is not.
 */
function Sheet({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgb(0 0 0 / 0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="w-full max-w-[680px] p-5"
        style={{
          background: "var(--bg-elevated)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: "calc(20px + var(--safe-bottom))",
          borderTop: "1px solid var(--border)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Grab handle: signals "this is a sheet you can dismiss". */}
        <div
          aria-hidden
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--border-strong)" }}
        />
        {children}
      </div>
    </div>
  );
}
