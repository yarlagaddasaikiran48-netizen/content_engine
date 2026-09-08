/**
 * Many stills, one continuous shot.
 *
 * The renderer used to hold a single background for the whole video with a
 * slow push across it. Taking a working Telugu devotional Short apart frame by
 * frame says that is the wrong format: twenty-four seconds of it carried about
 * twelve distinct images, a new one roughly every two seconds, and scene
 * detection found no hard cut anywhere in it — every change is a dissolve.
 *
 * So this builds the filter graph for N stills, each with its own Ken Burns
 * move, crossfaded into one another.
 *
 * The arithmetic is the whole file. Chaining N segments of length L with a
 * crossfade of X seconds overlaps each join, so the result is shorter than the
 * sum of its parts:
 *
 *     total = N*L - (N-1)*X
 *
 * We know the total — it is the narration's measured length — so L is solved
 * for rather than chosen:
 *
 *     L = (total + (N-1)*X) / N
 *
 * and the k-th crossfade starts at k*(L - X). Get this wrong in either
 * direction and FFmpeg still produces a file: too short and it ends on a
 * freeze, too long and the last image is cut off mid-move. Neither fails
 * loudly, which is why the numbers are computed here and tested rather than
 * written into the command by hand.
 */

import { FPS, HEIGHT, WIDTH } from "@/lib/render/video";

/** Long enough to read as a dissolve, short enough not to eat the shot. */
export const DEFAULT_CROSSFADE_SECONDS = 0.6;

/**
 * A still needs to be on screen long enough to be looked at. Below about a
 * second and a half the video reads as a slideshow on fast-forward, which is
 * the failure mode of every AI Short that generates too many images.
 */
export const MIN_SEGMENT_SECONDS = 1.5;

export interface SequencePlan {
  /** How many stills this plan is for. */
  count: number;
  /** Seconds each still is on screen, including its share of both dissolves. */
  segment: number;
  /** Seconds each dissolve lasts. Zero when there is only one still. */
  crossfade: number;
  /** Where each dissolve starts, one per join, so `count - 1` of them. */
  offsets: number[];
}

/**
 * How many stills a narration of this length wants.
 *
 * Two seconds a shot is what the reference measures at. The floor of one is
 * what makes every caller safe: a video that could only get a single image
 * still renders, it just renders the way it used to.
 */
export function shotCountFor(durationSeconds: number, secondsPerShot: number, max: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  const wanted = Math.round(durationSeconds / Math.max(0.5, secondsPerShot));
  return Math.max(1, Math.min(max, wanted));
}

/**
 * Solve the segment length and dissolve offsets for a run of stills.
 *
 * The crossfade is shortened rather than the segment when the two would fight:
 * with many images over a short narration, a fixed 0.6s dissolve can exceed
 * the time each image is actually on screen, and FFmpeg's xfade then reads
 * past the end of its input and stalls on the last frame it has.
 */
export function planSequence(
  count: number,
  totalSeconds: number,
  crossfadeSeconds: number = DEFAULT_CROSSFADE_SECONDS,
): SequencePlan {
  const n = Math.max(1, Math.floor(count));
  const total = Math.max(0.1, totalSeconds);

  if (n === 1) {
    return { count: 1, segment: total, crossfade: 0, offsets: [] };
  }

  // Never let a dissolve be longer than a third of the shot it is joining.
  const naiveSegment = total / n;
  const crossfade = Math.max(0.1, Math.min(crossfadeSeconds, naiveSegment / 3));

  const segment = (total + (n - 1) * crossfade) / n;
  const offsets = Array.from({ length: n - 1 }, (_, k) => (k + 1) * (segment - crossfade));

  return { count: n, segment, crossfade, offsets };
}

/**
 * The FFmpeg input arguments for the stills, in order.
 *
 * Each is a looped still trimmed to the segment length. The trim matters: a
 * looped image is an infinite stream, and zoompan is happy to keep producing
 * frames from it long after the segment should have ended.
 */
export function sequenceInputs(files: readonly string[], segment: number): string[] {
  const args: string[] = [];
  for (const file of files) {
    args.push("-loop", "1", "-t", segment.toFixed(3), "-i", file);
  }
  return args;
}

/**
 * The filter graph that turns those inputs into one stream, labelled `[seq]`.
 *
 * `moves[i]` is the Ken Burns filter for still i — passed in rather than built
 * here so the move stays random per shot without this function reaching for a
 * random number and becoming untestable.
 */
export function sequenceFilter(plan: SequencePlan, moves: readonly string[]): string {
  const { count, segment, crossfade, offsets } = plan;

  if (count !== moves.length) {
    throw new Error(`sequenceFilter: ${moves.length} moves for ${count} stills.`);
  }

  // Each still: the move, then a hard trim to the segment length, then a reset
  // of the timestamps so xfade sees every branch starting at zero.
  const branches = moves.map(
    (move, i) =>
      `[${i}:v]${move},trim=duration=${segment.toFixed(3)},setpts=PTS-STARTPTS,` +
      `scale=${WIDTH}:${HEIGHT},setsar=1,fps=${FPS}[v${i}]`,
  );

  if (count === 1) {
    return `${branches[0]};[v0]null[seq]`;
  }

  const joins: string[] = [];
  let carry = "v0";
  for (let k = 1; k < count; k++) {
    const out = k === count - 1 ? "seq" : `x${k}`;
    joins.push(
      `[${carry}][v${k}]xfade=transition=fade:duration=${crossfade.toFixed(3)}:` +
        `offset=${offsets[k - 1].toFixed(3)}[${out}]`,
    );
    carry = out;
  }

  return [...branches, ...joins].join(";");
}
