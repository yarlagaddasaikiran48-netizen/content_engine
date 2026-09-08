import { fail, messageOf, ok } from "@/lib/api";
import { dispatchRender } from "@/lib/github/dispatch";
import { describeCooldown, surveyTargets } from "@/lib/pipeline/cooldown";
import { buildTargets } from "@/lib/gemini/rotate";
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
    await reapStalledRenders(log);
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
 * Phase 1 — delete anything past its review window and remove its MP3.
 *
 * The verse is NOT handed back. It was burned when the script was written, and
 * a script you rejected is a verse you have already seen a telling of; putting
 * it back in the pool is how the same story finds its way in front of you a
 * second time. Sweeping only deletes the row -- it never revives a topic.
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
    await supabase.from("spiritual_videos").delete().eq("id", row.id);
    await supabase.from("generation_log").insert({
      topic_key: row.topic_key,
      outcome: "expired",
      detail: `Deleted after ${ttlHours}h without approval: ${row.title}`,
    });
  }

  log.push(`expire: removed ${rows.length}, topics stay spent`);
}

/**
 * How long a render may sit in "rendering" before it is presumed dead.
 *
 * The GitHub workflow caps itself at twenty minutes, so anything past thirty
 * has not been slow — it has failed without reaching the callback, or was
 * never picked up at all. That happens: a workflow can fail during checkout or
 * dependency install, before any of our code runs to report it.
 */
const RENDER_TIMEOUT_MINUTES = 30;

/**
 * Phase 1b — release renders that died without saying so.
 *
 * A row is set to "rendering" before the workflow is dispatched and only
 * leaves that state when the callback arrives. If the run dies first, nothing
 * ever moves it: the video is not rendered, not failed, and not visible
 * anywhere except as a status nobody can act on. One such row sat for
 * nineteen hours, which is what this phase exists to prevent.
 *
 * "failed" rather than "approved", deliberately. Failed rows surface on the
 * Queue with a Retry button, so the operator is told and decides; sending it
 * straight back to "approved" would re-dispatch a job that may fail for a
 * reason that never changes, once every tick, forever.
 */
async function reapStalledRenders(log: string[]): Promise<void> {
  const supabase = supabaseAdmin();
  const deadline = new Date(Date.now() - RENDER_TIMEOUT_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("spiritual_videos")
    .update({
      status: "failed",
      error_message: `The renderer never reported back within ${RENDER_TIMEOUT_MINUTES} minutes. The GitHub run probably failed before it could — check the Actions tab, then Retry.`,
    })
    .eq("status", "rendering")
    .lt("updated_at", deadline)
    .select("id, title");

  if (error) throw new Error(`Stalled-render sweep failed: ${error.message}`);

  const rows = (data ?? []) as Array<Pick<SpiritualVideo, "id" | "title">>;
  if (rows.length === 0) {
    log.push("reap: no stalled renders");
    return;
  }

  for (const row of rows) {
    await supabase.from("generation_log").insert({
      outcome: "render_timeout",
      detail: `Stuck in rendering for over ${RENDER_TIMEOUT_MINUTES} minutes: ${row.title}`,
    });
  }

  log.push(`reap: ${rows.length} stalled render(s) marked failed and retryable`);
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
  if (cfg.geminiApiKeys.length === 0) {
    log.push("generate: no Gemini API key set");
    return;
  }

  // Only stand down when every model on every key is spent. Each model has
  // its own daily budget on the same key, so the first refusal now costs the
  // rest of the day's scripts nothing at all.
  const targets = buildTargets(cfg.geminiApiKeys, cfg.geminiModels);
  const { free, soonest } = await surveyTargets("text", targets);
  if (free.length === 0) {
    log.push(
      `generate: all ${targets.length} Gemini model/key combinations are out of quota, waiting ${describeCooldown(soonest)}`,
    );
    return;
  }
  log.push(`generate: ${free.length}/${targets.length} model/key combinations still have quota`);

  const result = await generateVideo();
  log.push(
    result.ok
      ? `generate: ${madeToday + 1}/${cfg.scriptsPerDay} — "${result.video?.title}"`
      : `generate: failed — ${result.error}`,
  );
}
