import { fail, messageOf, ok } from "@/lib/api";
import { dispatchRender } from "@/lib/github/dispatch";
import { generateVideo } from "@/lib/pipeline/generate-video";
import { dueSlot, zonedDateKey } from "@/lib/schedule/slots";
import { loadConfig } from "@/lib/settings/config";
import { deleteAudio, supabaseAdmin } from "@/lib/supabase/admin";
import type { SpiritualVideo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/tick — the heartbeat, called every five minutes by pg_cron.
 *
 * Three phases, in this order and for these reasons:
 *
 *  1. Expire, first, because it hands scripture topics back to the pool that
 *     generation may want in phase 3.
 *  2. Publish, second, because it is the only time-critical phase. A missed
 *     slot cannot be made up.
 *  3. Generate, last, and exactly one script per tick. One script fits
 *     comfortably inside Vercel's 60-second limit where a batch of eight would
 *     not; eight ticks is forty minutes of wall clock, unattended, overnight.
 *
 * The whole run is wrapped in a database lease. A five-minute cron against a
 * serverless function will eventually overlap, and an overlapping tick would
 * double-publish a slot and double-spend a topic.
 */
export async function GET(request: Request) {
  const cfg = await loadConfig();

  if (cfg.cronSecret) {
    const url = new URL(request.url);
    const header = request.headers.get("authorization");
    const supplied =
      header?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
    if (supplied !== cfg.cronSecret) return fail("Unauthorized.", 401);
  }

  const supabase = supabaseAdmin();

  const { data: gotLock, error: lockError } = await supabase.rpc("try_lock", {
    p_name: "tick",
    p_seconds: 240,
  });
  if (lockError) return fail(`Could not take the tick lock: ${lockError.message}`, 500);
  if (!gotLock) return ok({ skipped: "locked", detail: "Another tick is still running." });

  const log: string[] = [];

  try {
    await expire(log, cfg.rejectTtlHours);
    await publishDueSlot(log, cfg);
    await topUpBatch(log, cfg);
    return ok({ log });
  } catch (error) {
    return fail(messageOf(error), 500, { log });
  } finally {
    await supabase.rpc("release_lock", { p_name: "tick" });
  }
}

/**
 * Phase 1 — delete anything past its review window, remove its MP3, and give
 * the scripture verse back so it is not burned on a script nobody wanted.
 */
async function expire(log: string[], ttlHours: number): Promise<void> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("spiritual_videos")
    .select("id, topic_key, audio_path, title")
    .in("status", ["pending", "rejected"])
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .limit(50);

  if (error) throw new Error(`Expiry sweep failed: ${error.message}`);
  const rows = (data ?? []) as Array<Pick<SpiritualVideo, "id" | "topic_key" | "audio_path" | "title">>;

  if (rows.length === 0) {
    log.push(`expire: nothing older than ${ttlHours}h`);
    return;
  }

  for (const row of rows) {
    if (row.audio_path) await deleteAudio(row.audio_path).catch(() => {});
    if (row.topic_key) await supabase.rpc("release_topic", { p_topic_key: row.topic_key });
    await supabase.from("spiritual_videos").delete().eq("id", row.id);
    await supabase.from("generation_log").insert({
      topic_key: row.topic_key,
      outcome: "expired",
      detail: `Deleted after ${ttlHours}h without approval: ${row.title}`,
    });
  }

  log.push(`expire: removed ${rows.length}, topics returned to the pool`);
}

/**
 * Phase 2 — if a slot is due and not already filled today, send the head of
 * the queue to the renderer.
 */
async function publishDueSlot(
  log: string[],
  cfg: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  const now = new Date();
  const slot = dueSlot(now, cfg.postingTimes, cfg.postingTimezone);

  if (!slot) {
    log.push("publish: no slot due");
    return;
  }

  const supabase = supabaseAdmin();
  const today = zonedDateKey(now, cfg.postingTimezone);

  // Has this slot already been filled today? published_slot plus the day makes
  // the check cheap and makes a double-post impossible even if the lease fails.
  const { data: already, error: checkError } = await supabase
    .from("spiritual_videos")
    .select("id, published_at")
    .eq("published_slot", slot)
    .gte("published_at", `${today}T00:00:00Z`)
    .limit(1);

  if (checkError) throw new Error(`Slot check failed: ${checkError.message}`);
  if ((already ?? []).length > 0) {
    log.push(`publish: slot ${slot} already filled today`);
    return;
  }

  const { data: head, error: headError } = await supabase
    .from("spiritual_videos")
    .select("*")
    .eq("status", "approved")
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("approved_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (headError) throw new Error(`Queue read failed: ${headError.message}`);
  if (!head) {
    log.push(`publish: slot ${slot} due but the queue is empty`);
    return;
  }

  const video = head as SpiritualVideo;

  if (!cfg.githubOwner || !cfg.githubRepo || !cfg.githubDispatchToken) {
    log.push(`publish: slot ${slot} due but the renderer is not configured`);
    return;
  }
  if (!cfg.siteUrl) {
    log.push(`publish: slot ${slot} due but the Site URL is not set`);
    return;
  }

  // Claim the slot before dispatching. If the dispatch throws, the row is
  // marked failed and surfaces on the Queue page rather than silently
  // reappearing at the head and being retried every five minutes.
  await supabase
    .from("spiritual_videos")
    .update({ status: "rendering", published_slot: slot })
    .eq("id", video.id);

  try {
    await dispatchRender({
      video_id: video.id,
      callback_url: `${cfg.siteUrl}/api/publish/callback`,
    });
    log.push(`publish: slot ${slot} -> "${video.title}" dispatched`);
  } catch (error) {
    await supabase
      .from("spiritual_videos")
      .update({ status: "failed", error_message: messageOf(error), published_slot: null })
      .eq("id", video.id);
    log.push(`publish: dispatch failed for "${video.title}": ${messageOf(error)}`);
  }
}

/**
 * Phase 3 — one script per tick until the day's target is met.
 */
async function topUpBatch(
  log: string[],
  cfg: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  const supabase = supabaseAdmin();
  const today = zonedDateKey(new Date(), cfg.postingTimezone);

  const { count, error } = await supabase
    .from("spiritual_videos")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`);

  if (error) throw new Error(`Daily count failed: ${error.message}`);

  const madeToday = count ?? 0;
  if (madeToday >= cfg.scriptsPerDay) {
    log.push(`generate: ${madeToday}/${cfg.scriptsPerDay} already written today`);
    return;
  }

  const result = await generateVideo();
  log.push(
    result.ok
      ? `generate: ${madeToday + 1}/${cfg.scriptsPerDay} — "${result.video?.title}"`
      : `generate: failed — ${result.error}`,
  );
}
