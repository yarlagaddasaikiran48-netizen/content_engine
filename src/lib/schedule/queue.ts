/**
 * Reading the publish queue.
 *
 * Lives here rather than in the route module because Next.js permits route
 * files to export only handlers and their config — the Queue page imports this
 * directly for its server render.
 */

import { projectSchedule } from "@/lib/schedule/slots";
import { loadConfig } from "@/lib/settings/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export interface QueueEntry {
  video: SpiritualVideo;
  when: string;
}

export interface QueueData {
  waiting: QueueEntry[];
  inFlight: SpiritualVideo[];
  postingTimes: string[];
  timezone: string;
  videosPerDay: number;
}

/** Approved rows in publish order, plus anything that failed and needs a look. */
export async function readQueue(): Promise<QueueData> {
  const cfg = await loadConfig();
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("spiritual_videos")
    .select("*")
    .in("status", ["approved", "rendering", "failed"])
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("approved_at", { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SpiritualVideo[];
  const waiting = rows.filter((r) => r.status === "approved");
  const inFlight = rows.filter((r) => r.status !== "approved");

  // The schedule is projected, never stored — see lib/schedule/slots.ts.
  const plan = projectSchedule(waiting.length, new Date(), cfg.postingTimes, cfg.postingTimezone);

  return {
    waiting: waiting.map((video, index) => ({ video, when: plan[index]?.label ?? "unscheduled" })),
    inFlight,
    postingTimes: cfg.postingTimes,
    timezone: cfg.postingTimezone,
    videosPerDay: cfg.videosPerDay,
  };
}

