/**
 * Whether a row may be handed to the renderer.
 *
 * This lives here rather than beside the route because both sides need it and
 * neither may import the other: a Next route module cannot export anything but
 * its handlers without failing the build's type check, and importing the route
 * into the queue component would drag the Supabase admin client into the
 * browser bundle.
 */

/**
 * How long a row may sit on "rendering" before Retry is allowed to take it.
 *
 * The render workflow carries timeout-minutes: 45, so nothing healthy is still
 * rendering after that. Five minutes on top covers a runner that queued behind
 * something else before it started counting.
 *
 * This tracks that timeout and must never sit below it. Set it lower and the
 * queue offers Retry on a render that is still legitimately running, which
 * dispatches a second one and draws every image twice.
 */
export const STALE_RENDER_MINUTES = 50;

export type Renderable = { ok: true } | { ok: false; reason: string };

/**
 * "pending" and "failed" are the obvious yeses. "rendering" is the one that
 * needs a clock: approval sets that status and the render script is what
 * normally clears it, so a workflow that dies before the script starts — a bad
 * apt package, a runner that vanishes — leaves the row on "rendering" with
 * nothing on the way to move it. That was unrecoverable from the dashboard and
 * had to be fixed in the SQL editor, which is not a thing to ask of someone
 * holding a phone.
 *
 * Past the timeout the render is not slow, it is gone, so re-dispatching cannot
 * collide with a live one. Inside the timeout it still refuses, because a
 * second dispatch there would render the same video twice.
 */
export function renderable(
  status: string,
  approvedAt: string | null,
  now: Date = new Date(),
): Renderable {
  if (status === "pending" || status === "failed") return { ok: true };

  if (status === "rendering") {
    if (staleMinutes(approvedAt, now) >= STALE_RENDER_MINUTES) return { ok: true };
    return {
      ok: false,
      reason:
        `This video has been rendering for ${Math.round(staleMinutes(approvedAt, now))} minutes. ` +
        `Give it until ${STALE_RENDER_MINUTES} before retrying, so it is not rendered twice.`,
    };
  }

  return { ok: false, reason: `This video is already "${status}" and cannot be approved again.` };
}

/** A render with no approved_at has no clock at all, so treat it as long gone. */
function staleMinutes(approvedAt: string | null, now: Date): number {
  const started = approvedAt ? Date.parse(approvedAt) : NaN;
  if (Number.isNaN(started)) return Infinity;
  return (now.getTime() - started) / 60_000;
}

/** The same question, for a UI that only needs the yes or no. */
export function stalledRender(status: string, approvedAt: string | null): boolean {
  return status === "rendering" && renderable(status, approvedAt).ok;
}
