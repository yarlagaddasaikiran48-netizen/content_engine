"use client";

import { useState } from "react";

import { StatusPill } from "@/components/StatusPill";
import type { SpiritualVideo } from "@/lib/types";

interface Props {
  video: SpiritualVideo;
  busy: boolean;
  onApprove: (video: SpiritualVideo) => void;
  onReject: (video: SpiritualVideo) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function VideoCard({ video, busy, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const actionable = video.status === "pending" || video.status === "failed";

  return (
    <article className="card overflow-hidden">
      {/* ---- header ---- */}
      <div className="flex flex-col gap-2.5 p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <StatusPill status={video.status} />
          <time
            className="shrink-0 text-xs"
            style={{ color: "var(--text-faint)" }}
            dateTime={video.created_at}
          >
            {relativeTime(video.created_at)}
          </time>
        </div>

        <h2 className="wrap-anywhere text-[1.0625rem] leading-snug font-bold">
          {video.title}
        </h2>

        {video.scripture && (
          <p className="text-[0.8125rem]" style={{ color: "var(--text-muted)" }}>
            <span className="font-semibold">{video.scripture}</span>
            {video.reference ? ` · ${video.reference}` : ""}
            {video.citation_url && (
              <>
                {" · "}
                <a
                  href={video.citation_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                  style={{ color: "var(--accent)" }}
                >
                  verify source
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {/* ---- audio ---- */}
      {video.audio_url && (
        <div className="px-4 pb-3">
          {/* preload="none" keeps mobile data usage at zero until it's played. */}
          <audio controls preload="none" src={video.audio_url} className="rounded-lg">
            Your browser cannot play this audio.
          </audio>
          <div
            className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            <span>{formatDuration(video.duration_seconds)}</span>
            <span>{video.word_count ?? "—"} words</span>
            <span>{video.voice}</span>
            {typeof video.max_similarity === "number" && (
              <span>{Math.round(video.max_similarity * 100)}% similar to past</span>
            )}
          </div>
        </div>
      )}

      {/* ---- script ---- */}
      <div className="px-4 pb-3">
        <p
          className={`wrap-anywhere text-[0.9375rem] leading-relaxed ${expanded ? "" : "clamp-4"}`}
          style={{ color: "var(--text)" }}
        >
          {video.script_body}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-[0.8125rem] font-semibold"
          style={{ color: "var(--accent)", minHeight: 32 }}
        >
          {expanded ? "Show less" : "Read full script"}
        </button>
      </div>

      {/* ---- hashtags ---- */}
      {video.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {video.hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-md px-2 py-0.5 text-xs font-medium"
              style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ---- expandable details ---- */}
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          className="text-[0.8125rem] font-semibold"
          style={{ color: "var(--text-muted)", minHeight: 32 }}
        >
          {showDetails ? "Hide" : "Show"} description &amp; source text
        </button>

        {showDetails && (
          <div className="mt-2 flex flex-col gap-3 text-[0.875rem]">
            <div>
              <p
                className="mb-1 text-xs font-bold tracking-wide uppercase"
                style={{ color: "var(--text-faint)" }}
              >
                YouTube description
              </p>
              <p
                className="wrap-anywhere whitespace-pre-wrap"
                style={{ color: "var(--text-muted)" }}
              >
                {video.seo_description}
              </p>
            </div>

            {video.sanskrit && (
              <div>
                <p
                  className="mb-1 text-xs font-bold tracking-wide uppercase"
                  style={{ color: "var(--text-faint)" }}
                >
                  Original verse
                </p>
                <p className="wrap-anywhere" style={{ color: "var(--text-muted)" }}>
                  {video.sanskrit}
                </p>
              </div>
            )}

            {video.translation && (
              <div>
                <p
                  className="mb-1 text-xs font-bold tracking-wide uppercase"
                  style={{ color: "var(--text-faint)" }}
                >
                  Translation{video.translator ? ` — ${video.translator}` : ""}
                </p>
                <p className="wrap-anywhere" style={{ color: "var(--text-muted)" }}>
                  {video.translation}
                </p>
              </div>
            )}

            {video.hook_context && (
              <div>
                <p
                  className="mb-1 text-xs font-bold tracking-wide uppercase"
                  style={{ color: "var(--text-faint)" }}
                >
                  Today&apos;s angle
                </p>
                <p className="wrap-anywhere" style={{ color: "var(--text-muted)" }}>
                  {video.hook_context}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- status messages ---- */}
      {video.status === "published" && video.youtube_url && (
        <a
          href={video.youtube_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn mx-4 mb-4 w-[calc(100%-2rem)]"
          style={{ background: "var(--success-soft)", color: "var(--success)" }}
        >
          Watch on YouTube →
        </a>
      )}

      {video.status === "failed" && video.error_message && (
        <p
          className="wrap-anywhere mx-4 mb-4 rounded-lg p-3 text-[0.8125rem]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {video.error_message}
        </p>
      )}

      {video.status === "rejected" && video.rejection_reason && (
        <p
          className="wrap-anywhere mx-4 mb-4 text-[0.8125rem]"
          style={{ color: "var(--text-faint)" }}
        >
          Reason: {video.rejection_reason}
        </p>
      )}

      {/* ---- actions ---- */}
      {actionable && (
        <div
          className="grid grid-cols-[1fr_auto] gap-2 border-t p-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-sunken)" }}
        >
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 48 }}
            disabled={busy}
            onClick={() => onApprove(video)}
          >
            {busy ? <span className="spinner" /> : null}
            {video.status === "failed" ? "Retry upload" : "Approve & upload"}
          </button>
          <button
            type="button"
            className="btn btn-danger px-5"
            style={{ minHeight: 48 }}
            disabled={busy}
            onClick={() => onReject(video)}
          >
            Reject
          </button>
        </div>
      )}
    </article>
  );
}
