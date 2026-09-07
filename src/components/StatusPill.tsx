import type { VideoStatus } from "@/lib/types";

const STYLES: Record<VideoStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: "Awaiting review", bg: "var(--accent-soft)", fg: "var(--accent)" },
  approved: { label: "Approved", bg: "var(--info-soft)", fg: "var(--info)" },
  rendering: { label: "Rendering", bg: "var(--info-soft)", fg: "var(--info)" },
  published: { label: "Live on YouTube", bg: "var(--success-soft)", fg: "var(--success)" },
  rejected: { label: "Rejected", bg: "var(--bg-sunken)", fg: "var(--text-faint)" },
  failed: { label: "Failed", bg: "var(--danger-soft)", fg: "var(--danger)" },
};

export function StatusPill({ status }: { status: VideoStatus }) {
  const style = STYLES[status] ?? STYLES.pending;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: style.bg, color: style.fg }}
    >
      {(status === "rendering" || status === "approved") && (
        <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
      )}
      {style.label}
    </span>
  );
}
