/**
 * What the channel has learned about itself.
 *
 * This is the half of the loop that makes performance data worth collecting.
 * The Performance page shows numbers to a person; this turns the same numbers
 * into a paragraph the writer reads before it writes, so that a channel with
 * forty published videos writes differently from one with none.
 *
 * Three rules govern everything below, and they are the difference between a
 * learning loop and a superstition machine:
 *
 *  1. NEVER SPEAK FROM A SMALL SAMPLE. Two videos about Shiva outperforming
 *     one about Vishnu is not a finding, it is a coin landing heads. Every
 *     comparison here needs a minimum count on BOTH sides before it is
 *     allowed to say anything, and the whole brief stays silent until the
 *     channel has enough published work to have a pattern at all.
 *
 *  2. NEVER COMPARE RAW VIEWS. A video published six weeks ago has had six
 *     weeks to collect them. Every metric that drives a conclusion is a rate
 *     -- a share of viewers retained, a share of the video completed, an
 *     action per view -- so that age is not silently mistaken for quality.
 *
 *  3. REPORT THE GAP, NOT THE RANKING. "Shiva does best" is unfalsifiable
 *     encouragement. "Shiva holds 71%, Vishnu 52%, over nine and seven videos"
 *     is a fact the writer can act on and a reader can check.
 */

import type { ScriptTone } from "@/lib/tts/voice";

/** One archived, published video, with whatever performance has arrived. */
export interface PerformedVideo {
  id: string;
  title: string;
  script_body: string;
  youtube_video_id: string | null;
  youtube_url: string | null;
  published_at: string;
  deity: string | null;
  tone: ScriptTone | null;
  scripture: string | null;
  target_seconds: number | null;
  duration_seconds: number | null;
  word_count: number | null;

  views: number | null;
  engaged_views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribers_gained: number | null;
  average_view_percentage: number | null;
  retention_3s: number | null;
  relative_retention: number | null;
  stats_updated_at: string | null;
}

/**
 * How many measured videos before the engine is allowed to draw a conclusion
 * at all, and how many on each side of a comparison before that particular
 * comparison may be stated.
 */
export const MIN_SAMPLE = 6;
export const MIN_GROUP = 3;

/**
 * The smallest gap worth mentioning, in percentage points.
 *
 * Below this the difference is inside the noise of a channel this size, and
 * telling the writer to chase it would be telling it to chase nothing.
 */
export const MIN_GAP_POINTS = 6;

/**
 * The opening line, which is the part of the script the hook score measures.
 *
 * Telugu sentences end in the same full stop as English ones, and the
 * narration contains no markdown or line structure by the time it is written,
 * so splitting on terminal punctuation is both sufficient and language-blind.
 * A script with no punctuation at all yields its first dozen words rather than
 * the whole body -- long enough to recognise, short enough to compare.
 */
export function hookLine(scriptBody: string): string {
  const trimmed = scriptBody.trim();
  if (!trimmed) return "";

  // No punctuation means no sentence to take, so fall through to the word cap
  // rather than treating the entire body as one opening line. Getting this
  // wrong is not cosmetic: hookWordCount feeds the "six words or fewer" bucket
  // in the brief, and a whole unpunctuated script counted as its own opening
  // would file every such video under "twelve words or more" and then report
  // that finding as though it meant something.
  const match = trimmed.match(/^[\s\S]*?[.!?।](\s|$)/);
  const first = match ? match[0].trim() : "";
  if (first && first.length <= 160) return first;

  return trimmed.split(/\s+/).slice(0, 12).join(" ");
}

/** Words in the opening line. The one structural property of a hook that survives translation. */
export function hookWordCount(scriptBody: string): number {
  const line = hookLine(scriptBody);
  return line ? line.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Does the script open by asking rather than telling?
 *
 * A trailing question mark settles it in any language. Telugu also asks
 * without one, using an interrogative word, so the common ones are listed --
 * this is a heuristic used only to bucket videos for comparison, and a
 * mis-bucketed video costs an averaged data point, not a wrong instruction.
 */
const TELUGU_QUESTION_WORDS = ["ఎందుకు", "ఏమిటి", "ఏం", "ఎవరు", "ఎలా", "ఎప్పుడు", "ఎక్కడ", "తెలుసా"];

export function opensWithQuestion(scriptBody: string): boolean {
  const line = hookLine(scriptBody);
  if (!line) return false;
  if (/[?？]\s*$/.test(line)) return true;
  return TELUGU_QUESTION_WORDS.some((word) => line.includes(word));
}

/** A video with enough measurement to be worth reasoning about. */
export function isMeasured(video: PerformedVideo): boolean {
  return (
    video.stats_updated_at !== null &&
    (video.retention_3s !== null || video.average_view_percentage !== null)
  );
}

/**
 * Actions per view, on the scale the actions actually matter.
 *
 * A subscribe is worth far more than a like and is far rarer, so an unweighted
 * sum would be a like counter with rounding errors. The weights are an
 * ordering, not a currency: they say a share beats a comment beats a like, and
 * nothing finer than that is claimed.
 */
export function engagementRate(video: PerformedVideo): number | null {
  // A reported zero is not a reason to give up on the video: a Short can have
  // thousands of views and no engaged views at all in its first hours, and
  // `engaged_views ?? views` would take the zero -- `??` only falls through on
  // null -- and throw away a usable denominator. Zero falls through here too.
  const base =
    video.engaged_views && video.engaged_views > 0 ? video.engaged_views : video.views;
  if (!base || base <= 0) return null;

  const weighted =
    (video.likes ?? 0) * 1 +
    (video.comments ?? 0) * 3 +
    (video.shares ?? 0) * 5 +
    (video.subscribers_gained ?? 0) * 10;

  return weighted / base;
}

/**
 * One number for "how well did this do", between 0 and 1.
 *
 * Weighted towards the hook because the hook is what the writer controls most
 * directly and what fails most often. Any component that is missing has its
 * weight redistributed across the ones present, so a video with no retention
 * curve is scored on what it does have rather than being punished with a zero
 * for a number YouTube simply withheld.
 */
export function score(video: PerformedVideo): number | null {
  const parts: Array<{ weight: number; value: number }> = [];

  if (video.retention_3s !== null) {
    parts.push({ weight: 0.45, value: clamp01(video.retention_3s) });
  }
  if (video.average_view_percentage !== null) {
    parts.push({ weight: 0.35, value: clamp01(video.average_view_percentage / 100) });
  }
  const engagement = engagementRate(video);
  if (engagement !== null) {
    // 10% weighted-actions-per-view is an excellent Short; treat that as full marks.
    parts.push({ weight: 0.2, value: clamp01(engagement / 0.1) });
  }

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A named group of videos and how they did, ready to be compared with another. */
export interface Group {
  label: string;
  count: number;
  /** Mean hook retention as a percentage, when enough of the group has one. */
  hookPercent: number | null;
  /** Mean completion as a percentage. */
  completionPercent: number | null;
}

function summariseGroup(label: string, videos: PerformedVideo[]): Group {
  const hooks = videos.map((v) => v.retention_3s).filter((v): v is number => v !== null);
  const completions = videos
    .map((v) => v.average_view_percentage)
    .filter((v): v is number => v !== null);

  return {
    label,
    count: videos.length,
    hookPercent: hooks.length >= MIN_GROUP ? mean(hooks) * 100 : null,
    completionPercent: completions.length >= MIN_GROUP ? mean(completions) : null,
  };
}

/** Bucket by any key, keeping only buckets large enough to speak for themselves. */
function groupsBy(
  videos: PerformedVideo[],
  key: (video: PerformedVideo) => string | null,
): Group[] {
  const buckets = new Map<string, PerformedVideo[]>();
  for (const video of videos) {
    const label = key(video);
    if (!label) continue;
    const bucket = buckets.get(label);
    if (bucket) bucket.push(video);
    else buckets.set(label, [video]);
  }

  return [...buckets.entries()]
    .filter(([, group]) => group.length >= MIN_GROUP)
    .map(([label, group]) => summariseGroup(label, group));
}

/**
 * The one sentence a pair of groups earns, or nothing.
 *
 * "Or nothing" is the important half. A comparison is stated only when both
 * sides have a real measurement and the gap clears MIN_GAP_POINTS; otherwise
 * the brief says less, which is the correct behaviour for a channel that does
 * not yet know.
 */
function compare(
  groups: Group[],
  metric: "hookPercent" | "completionPercent",
  describe: (best: Group, worst: Group, gap: number) => string,
): string | null {
  const usable = groups.filter((group) => group[metric] !== null);
  if (usable.length < 2) return null;

  const sorted = [...usable].sort((a, b) => (b[metric] as number) - (a[metric] as number));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const gap = (best[metric] as number) - (worst[metric] as number);
  if (gap < MIN_GAP_POINTS) return null;

  return describe(best, worst, gap);
}

export interface LearningBrief {
  /** How many measured videos this is built from. */
  sampleSize: number;
  /** Plain statements of what the numbers say. Empty when they say nothing yet. */
  findings: string[];
  /** Opening lines of the best-performing videos, strongest first. */
  strongestHooks: string[];
  /** Opening lines of the worst, so the writer can see the shape to avoid. */
  weakestHooks: string[];
}

/**
 * Read the channel's own history.
 *
 * Returns null, deliberately, rather than an empty brief, when there is not
 * enough measured work to say anything. A caller that gets null must inject
 * nothing at all -- an empty "what works" section reads to a model as "nothing
 * works", which is worse than silence.
 */
export function buildLearningBrief(videos: PerformedVideo[]): LearningBrief | null {
  const measured = videos.filter(isMeasured);
  if (measured.length < MIN_SAMPLE) return null;

  const findings: string[] = [];

  const byDeity = compare(
    groupsBy(measured, (v) => v.deity),
    "hookPercent",
    (best, worst, gap) =>
      `Episodes about ${best.label} hold ${Math.round(best.hookPercent as number)}% of viewers past the first three seconds; episodes about ${worst.label} hold ${Math.round(worst.hookPercent as number)}%. That is a ${Math.round(gap)}-point gap across ${best.count} and ${worst.count} videos.`,
  );
  if (byDeity) findings.push(byDeity);

  const byTone = compare(
    groupsBy(measured, (v) => v.tone),
    "completionPercent",
    (best, worst, gap) =>
      `"${best.label}" scripts are watched to ${Math.round(best.completionPercent as number)}% on average; "${worst.label}" scripts to ${Math.round(worst.completionPercent as number)}%. A ${Math.round(gap)}-point gap over ${best.count} and ${worst.count} videos.`,
  );
  if (byTone) findings.push(byTone);

  const byHookLength = compare(
    groupsBy(measured, (v) => {
      const words = hookWordCount(v.script_body);
      if (words === 0) return null;
      if (words <= 6) return "six words or fewer";
      if (words <= 11) return "seven to eleven words";
      return "twelve words or more";
    }),
    "hookPercent",
    (best, worst, gap) =>
      `Opening lines of ${best.label} hold ${Math.round(gap)} points more of the audience past three seconds than openings of ${worst.label} (${Math.round(best.hookPercent as number)}% against ${Math.round(worst.hookPercent as number)}%).`,
  );
  if (byHookLength) findings.push(byHookLength);

  const byHookShape = compare(
    groupsBy(measured, (v) =>
      opensWithQuestion(v.script_body) ? "opening on a question" : "opening on a statement",
    ),
    "hookPercent",
    (best, worst, gap) =>
      `Scripts ${best.label} hold ${Math.round(best.hookPercent as number)}% past three seconds against ${Math.round(worst.hookPercent as number)}% for scripts ${worst.label} — ${Math.round(gap)} points.`,
  );
  if (byHookShape) findings.push(byHookShape);

  const ranked = measured
    .map((video) => ({ video, value: score(video) }))
    .filter((entry): entry is { video: PerformedVideo; value: number } => entry.value !== null)
    .sort((a, b) => b.value - a.value);

  // The two lists must not overlap. At the minimum sample of six videos a naive
  // top-five and bottom-three share two of them, and showing the writer the
  // same opening under both "held the most people" and "lost the most people"
  // is worse than showing it under neither.
  const strongest = ranked.slice(0, Math.min(5, Math.floor(ranked.length / 2)));
  const chosen = new Set(strongest.map((entry) => entry.video.id));
  const weakest = [...ranked]
    .reverse()
    .filter((entry) => !chosen.has(entry.video.id))
    .slice(0, 3);

  return {
    sampleSize: measured.length,
    findings,
    strongestHooks: strongest.map((entry) => hookLine(entry.video.script_body)),
    weakestHooks: weakest.map((entry) => hookLine(entry.video.script_body)),
  };
}

/**
 * The brief as the writer reads it, or null when there is nothing to say.
 *
 * The closing instruction is not decoration. Handing a model five successful
 * openings without it produces a sixth that is a near-copy of one of them,
 * which the similarity check then rejects — burning a generation to learn a
 * lesson this sentence could have taught for free.
 */
export function renderLearningBrief(brief: LearningBrief | null): string | null {
  if (!brief) return null;
  if (brief.findings.length === 0 && brief.strongestHooks.length === 0) return null;

  const sections: string[] = [
    `WHAT THIS CHANNEL HAS LEARNED — measured over ${brief.sampleSize} published videos, not guessed`,
  ];

  if (brief.findings.length > 0) {
    sections.push(brief.findings.map((finding) => `- ${finding}`).join("\n"));
  }

  if (brief.strongestHooks.length > 0) {
    sections.push(
      `The openings that held the most people:\n${brief.strongestHooks
        .map((hook) => `- ${hook}`)
        .join("\n")}`,
    );
  }

  if (brief.weakestHooks.length > 0) {
    sections.push(
      `The openings that lost the most people:\n${brief.weakestHooks
        .map((hook) => `- ${hook}`)
        .join("\n")}`,
    );
  }

  sections.push(
    "Take the shape, never the wording. Reusing a phrase from the list above will be caught by the duplicate check and the script thrown away. What you are looking for is what the strong ones have in common — how quickly they arrive at something happening, how concrete the first image is, how much they refuse to explain.",
  );

  return sections.join("\n\n");
}
