/**
 * Reading the publish queue.
 *
 * Lives here rather than in the route module because Next.js permits route
 * files to export only handlers and their config — the Queue page imports this
 * directly for its server render.
 */

import { describeCooldown, surveyKeys } from "@/lib/pipeline/cooldown";
import { projectSchedule } from "@/lib/schedule/slots";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export interface QueueEntry {
  video: SpiritualVideo;
  when: string;
}

export interface QueueData {
  /** Rendered, watchable, awaiting the Post button. */
  ready: SpiritualVideo[];
  waiting: QueueEntry[];
  inFlight: SpiritualVideo[];
  postingTimes: string[];
  timezone: string;
  videosPerDay: number;
  /**
   * Why the engine is not writing, when it is not. Null when it is working.
   *
   * The tick logs its reasons into a response nobody ever sees — pg_cron calls
   * it, reads nothing, and discards the body. So a spent quota looked exactly
   * like a broken engine from the operator's phone: an empty deck, no error,
   * nothing to act on. This is that log line, surfaced where it is read.
   */
  quota: { keys: number; free: number; waitSeconds: number; message: string } | null;
}

/** Approved rows in publish order, plus anything that failed and needs a look. */
export async function readQueue(): Promise<QueueData> {
  const cfg = await loadConfig();
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("spiritual_videos")
    .select("*")
    .in("status", ["approved", "rendering", "ready", "failed"])
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("approved_at", { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SpiritualVideo[];
  const waiting = rows.filter((r) => r.status === "approved");
  const ready = rows.filter((r) => r.status === "ready");
  const inFlight = rows.filter((r) => r.status === "rendering" || r.status === "failed");

  // The schedule is projected, never stored — see lib/schedule/slots.ts.
  const plan = projectSchedule(waiting.length, new Date(), cfg.postingTimes, cfg.postingTimezone);

  return {
    ready,
    waiting: waiting.map((video, index) => ({ video, when: plan[index]?.label ?? "unscheduled" })),
    inFlight,
    postingTimes: cfg.postingTimes,
    timezone: cfg.postingTimezone,
    videosPerDay: cfg.videosPerDay,
    quota: await quotaState(cfg.geminiApiKeys),
  };
}

/** Null while at least one key can still be spent — there is nothing to report. */
async function quotaState(keys: string[]): Promise<QueueData["quota"]> {
  if (keys.length === 0) {
    return {
      keys: 0,
      free: 0,
      waitSeconds: 0,
      message: "No Gemini API key is set, so no scripts are being written. Add one in Settings.",
    };
  }

  const { free, soonest } = await surveyKeys("text", keys);
  if (free.length > 0) return null;

  return {
    keys: keys.length,
    free: 0,
    waitSeconds: soonest,
    message:
      keys.length === 1
        ? `Your Gemini key is out of quota for today. Writing resumes in ${describeCooldown(soonest)}. Adding a second key from a different Google account in Settings would keep it going.`
        : `All ${keys.length} Gemini keys are out of quota. Writing resumes in ${describeCooldown(soonest)}.`,
  };
}

