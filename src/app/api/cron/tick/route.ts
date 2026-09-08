import { fail, messageOf, ok } from "@/lib/api";
import { dispatchRender } from "@/lib/github/dispatch";
import { describeCooldown, quotaCooldownRemaining } from "@/lib/pipeline/cooldown";
import { generateVideo } from "@/lib/pipeline/generate-video";
import { dueSlot, orderedSlots, slotMinutes, zonedDateKey, zonedParts } from "@/lib/schedule/slots";
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
 *  2. Render ahead, so a finished video is always waiting to be watched. This
 *     is what makes the preview useful: the file exists before the slot, not
 *     at it.
 *  3. Publish, only when auto-publish is on. Off by default, because the point
 *     of the preview is that nothing reaches the channel unwatched.
 *  4. Generate, last, and exactly one script per tick. One script fits
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
    await renderAhead(log, cfg);
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
 * Phase 2 — keep enough rendered videos waiting to be watched.
 *
 * Rendering happens ahead of the slot rather than at it. A render takes
 * minutes; doing it at the slot would mean the video is late, and doing it
 * only on demand would mean the operator opens the app to find nothing to
 * watch. One render per tick keeps the runner load flat.
 */
async function renderAhead(
  log: string[],
  cfg: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  const supabase = supabaseAdmin();

  if (!cfg.githubOwner || !cfg.githubRepo || !cfg.githubDispatchToken || !cfg.siteUrl) {
    log.push("render: renderer or Site URL not configured");
    return;
  }

  const [{ count: readyCount }, { count: renderingCount }] = await Promise.all([
    supabase.from("spiritual_videos").select("id", { count: "exact", head: true }).eq("status", "ready"),
    supabase.from("spiritual_videos").select("id", { count: "exact", head: true }).eq("status", "rendering"),
  ]);

  const inHand = (readyCount ?? 0) + (renderingCount ?? 0);
  if (inHand >= cfg.videosPerDay) {
    log.push(`render: ${inHand} already rendered or rendering`);
    return;
  }

  const { data: head, error } = await supabase
    .from("spiritual_videos")
    .select("*")
    .eq("status", "approved")
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("approved_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Queue read failed: ${error.message}`);
  if (!head) {
    log.push("render: nothing approved to render");
    return;
  }

  const video = head as SpiritualVideo;
  await supabase.from("spiritual_videos").update({ status: "rendering" }).eq("id", video.id);

  try {
    await dispatchRender({
      video_id: video.id,
      callback_url: `${cfg.siteUrl}/api/publish/callback`,
    });
    log.push(`render: dispatched "${video.title}"`);
  } catch (err) {
    await supabase
      .from("spiritual_videos")
      .update({ status: "failed", error_message: messageOf(err) })
      .eq("id", video.id);
    log.push(`render: dispatch failed for "${video.title}": ${messageOf(err)}`);
  }
}

/**
 * Phase 3 — auto-publish, only if the operator has asked for it.
 */
async function publishDueSlot(
  log: string[],
  cfg: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  if (!cfg.autoPublish) {
    log.push("publish: auto-publish is off; waiting for the Post button");
    return;
  }

  const now = new Date();
  const slot = dueSlot(now, cfg.postingTimes, cfg.postingTimezone);
  if (!slot) {
    log.push("publish: no slot due");
    return;
  }

  const supabase = supabaseAdmin();
  const today = zonedDateKey(now, cfg.postingTimezone);

  // "Has this slot already fired?" cannot be answered from spiritual_videos any
  // more, because a published row is archived and deleted. Counting today's
  // archive against the number of slots that have already come round answers
  // the same question and survives the deletion.
  const { count: publishedToday, error: countError } = await supabase
    .from("published_archive")
    .select("id", { count: "exact", head: true })
    .gte("published_at", `${today}T00:00:00Z`);

  if (countError) throw new Error(`Archive count failed: ${countError.message}`);

  const nowMinutes = zonedParts(now, cfg.postingTimezone).minutes;
  const slotsElapsed = orderedSlots(cfg.postingTimes).filter(
    (s) => slotMinutes(s) <= nowMinutes,
  ).length;

  if ((publishedToday ?? 0) >= slotsElapsed) {
    log.push(`publish: ${publishedToday}/${slotsElapsed} slots already posted today`);
    return;
  }

  const { data: head, error } = await supabase
    .from("spiritual_videos")
    .select("*")
    .eq("status", "ready")
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("rendered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Ready read failed: ${error.message}`);
  if (!head) {
    log.push(`publish: slot ${slot} due but nothing is rendered yet`);
    return;
  }

  const video = head as SpiritualVideo;

  try {
    await dispatchRender(
      { video_id: video.id, callback_url: `${cfg.siteUrl}/api/publish/callback` },
      "publish-video",
    );
    await supabase
      .from("spiritual_videos")
      .update({ published_slot: slot })
      .eq("id", video.id);
    log.push(`publish: slot ${slot} -> "${video.title}" dispatched`);
  } catch (err) {
    log.push(`publish: dispatch failed for "${video.title}": ${messageOf(err)}`);
  }
}

/**
 * Phase 4 — one script per tick until the day's target is met.
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

  // A failed generation writes no row, so madeToday never moves and this
  // branch is reached again in five minutes. That is the right behaviour for
  // a script that came out badly and the wrong one for a spent quota, where
  // every retry is refused and counted. Honour the stand-down.
  const cooling = await quotaCooldownRemaining();
  if (cooling > 0) {
    log.push(`generate: Gemini quota spent, waiting ${describeCooldown(cooling)}`);
    return;
  }

  const result = await generateVideo();
  log.push(
    result.ok
      ? `generate: ${madeToday + 1}/${cfg.scriptsPerDay} — "${result.video?.title}"`
      : `generate: failed — ${result.error}`,
  );
}
