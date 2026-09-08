/**
 * The generation pipeline.
 *
 * claim a never-used topic
 *   -> ground it with the real verse text
 *   -> Gemini writes the script
 *   -> validate length, structure and language safety
 *   -> reject if the content hash already exists (layer 2)
 *   -> reject if too similar to recent scripts (layer 3)
 *   -> insert the row as 'pending'
 *   -> mark the topic permanently spent
 *
 * Any rejection releases the topic back to the pool and tries a different one,
 * up to MAX_GENERATION_ATTEMPTS. Every outcome is written to generation_log.
 *
 * Note what is NOT here any more: the narration. It used to be recorded for
 * every script this loop produced, and on this project's free tier that was
 * backwards — the text models allow twenty requests a day, the speech model
 * ten, so every script rejected on sight spent the scarcer of the two budgets.
 * The renderer records it after approval instead, for the one script that is
 * actually going to become a video.
 */

import { loadConfig, wordWindow, type AppConfig } from "@/lib/settings/config";
import { contentHash } from "@/lib/dedupe/hash";
import { describeCooldown, surveyTargets } from "@/lib/pipeline/cooldown";
import { isFatalGenerationError, isQuotaError, quotaRetrySeconds } from "@/lib/pipeline/fatal";
import { generateScript } from "@/lib/gemini/generate";
import { buildTargets } from "@/lib/gemini/rotate";
import { buildHookContext } from "@/lib/sources/hook";
import { buildLearningBrief, renderLearningBrief } from "@/lib/learning/insights";
import { readPerformance } from "@/lib/learning/store";
import { fetchGitaVerse } from "@/lib/sources/gita";
import { rotationFrom } from "@/lib/sources/mahapuranas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateScript } from "@/lib/safety/validate";
import type { SpiritualVideo, Topic } from "@/lib/types";

/**
 * The shortest run worth starting.
 *
 * An attempt is one Gemini call for a full script plus four database round
 * trips. Nothing useful has ever finished inside twelve seconds, so if less
 * than that remains there is no point beginning one -- the only outcome is the
 * platform killing the function mid-call.
 */
const MIN_ATTEMPT_BUDGET_MS = 12_000;

/**
 * How long generation may take when nobody says otherwise.
 *
 * Both callers do say otherwise; this exists so a future third caller cannot
 * accidentally reintroduce an unbounded run.
 */
const DEFAULT_BUDGET_MS = 45_000;

export interface GenerateOptions {
  /**
   * Epoch milliseconds after which no NEW attempt may start.
   *
   * This is the difference between a failure the operator can read and one
   * they cannot. Vercel gives the function sixty seconds and then kills it,
   * and a killed function returns the platform's own plain-text error page --
   * so the browser, which is expecting JSON, reports "Unexpected token 'A'"
   * and the entire log of what actually went wrong is discarded. Stopping
   * ourselves a little early turns that into a real answer with the trail
   * still attached.
   *
   * An in-flight attempt is never interrupted: the Gemini SDK gives us nothing
   * to abort, and a half-written script is worse than a slow one. The deadline
   * governs whether the NEXT attempt begins.
   */
  deadline?: number;
}

export interface GenerationOutcome {
  ok: boolean;
  video?: SpiritualVideo;
  attempts: number;
  /** Human-readable trail of what happened, surfaced by the API route. */
  log: string[];
  error?: string;
}

type LogOutcome =
  | "accepted"
  | "duplicate"
  | "too_similar"
  | "unsafe"
  | "invalid"
  | "error"
  | "no_topics"
  // Measured facts about the MP3, recorded by the renderer now that the
  // narration is made there. Distinct from "invalid", which is the word-count
  // guess this loop makes before any audio exists.
  | "too_long"
  | "too_short";

async function recordAttempt(
  topicKey: string | null,
  attempt: number,
  outcome: LogOutcome,
  detail: string,
  similarity?: number,
): Promise<void> {
  try {
    await supabaseAdmin().from("generation_log").insert({
      topic_key: topicKey,
      attempt,
      outcome,
      detail: detail.slice(0, 2_000),
      similarity: similarity ?? null,
    });
  } catch {
    /* logging must never break generation */
  }
}

/** Claim one never-used topic from anywhere in the ledger. */
async function claimAnyTopic(exclude: string[]): Promise<Topic | null> {
  const { data, error } = await supabaseAdmin().rpc("claim_unused_topic", {
    p_exclude: exclude,
  });
  if (error) {
    throw new Error(`claim_unused_topic failed: ${error.message}`);
  }
  const topic = data as Topic | null;
  return topic && topic.topic_key ? topic : null;
}

/** Claim one never-used topic belonging to a specific scripture. */
async function claimTopicFromScripture(
  scripture: string,
  exclude: string[],
): Promise<Topic | null> {
  const { data, error } = await supabaseAdmin().rpc(
    "claim_unused_topic_for_scripture",
    { p_scripture: scripture, p_exclude: exclude },
  );
  if (error) {
    throw new Error(`claim_unused_topic_for_scripture failed: ${error.message}`);
  }
  const topic = data as Topic | null;
  return topic && topic.topic_key ? topic : null;
}

/**
 * Pick today's topic.
 *
 * With the rotation on, the eighteen Maha Puranas are walked in their
 * traditional order starting from whichever one today maps to. A Purana with
 * nothing unused left is skipped rather than fatal, and once every Purana is
 * exhausted the whole ledger — Gita, Upanishads, Ramayana — is used as the
 * fallback. Nothing about the schedule is stored, so it cannot drift.
 */
async function claimTopic(
  exclude: string[],
  log: string[],
  config: AppConfig,
  exhausted: Set<string>,
): Promise<Topic | null> {
  if (config.puranaRotation) {
    const rotation = rotationFrom(new Date(), {
      epoch: config.rotationEpoch,
      daysPerPurana: config.rotationDaysPerPurana,
    });

    for (const [offset, purana] of rotation.entries()) {
      // A Purana with nothing unused left is still empty on the next attempt,
      // and asking again costs another round trip to the database. Walking
      // eighteen of them four times over is up to seventy-two sequential
      // queries inside a sixty-second function, all of them to re-learn what
      // the first attempt already established.
      if (exhausted.has(purana.name)) continue;

      const topic = await claimTopicFromScripture(purana.name, exclude);
      if (!topic) exhausted.add(purana.name);
      if (topic) {
        log.push(
          offset === 0
            ? `Rotation: ${purana.name} (#${purana.order} of 18, ${purana.category})`
            : `Rotation: ${purana.name} (#${purana.order}) — skipped ${offset} exhausted Purana(s)`,
        );
        return topic;
      }
    }
    log.push("Rotation: all eighteen Puranas exhausted; drawing from the full ledger.");
  }

  return claimAnyTopic(exclude);
}

async function releaseTopic(topicKey: string): Promise<void> {
  try {
    await supabaseAdmin().rpc("release_topic", { p_topic_key: topicKey });
  } catch {
    /* the 15-minute claim timeout will reclaim it anyway */
  }
}

/**
 * Gita topics store only the reference at seed time if the API was slow.
 * Fetch the real Sanskrit and translation before prompting so the model is
 * never working from the reference alone.
 */
async function hydrateTopic(topic: Topic): Promise<Topic> {
  if (topic.source !== "gita" || (topic.sanskrit && topic.translation)) {
    return topic;
  }

  const match = topic.topic_key.match(/^gita:(\d+)\.(\d+)$/);
  if (!match) return topic;

  try {
    const verse = await fetchGitaVerse(Number(match[1]), Number(match[2]));
    if (!verse) return topic;
    return {
      ...topic,
      sanskrit: verse.sanskrit,
      translation: verse.translation,
      translator: verse.translator,
    };
  } catch {
    return topic;
  }
}

/** Titles of recent videos, so the model avoids repeating an angle. */
async function fetchRecentTitles(limit = 25): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("spiritual_videos")
    .select("title")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => row.title as string);
}

/**
 * What the channel's own numbers say, as prose for the prompt.
 *
 * Returns null in three cases that are deliberately indistinguishable to the
 * caller: learning is switched off, migration 005 has not been run, or there
 * are not yet enough measured videos to have a finding. All three mean the
 * same thing to the writer -- write from the craft rules alone -- and none of
 * them is a reason to fail a generation.
 */
async function loadLearningBrief(
  config: AppConfig,
  log: string[],
): Promise<string | null> {
  if (!config.learningEnabled) return null;

  try {
    const brief = renderLearningBrief(buildLearningBrief(await readPerformance()));
    if (brief) log.push("Writing against the channel's own retention data.");
    return brief;
  } catch (error) {
    log.push(
      `No performance data to learn from yet (${error instanceof Error ? error.message : String(error)}).`,
    );
    return null;
  }
}

/**
 * Was the only thing wrong with this script its length?
 *
 * Worth asking, because length is the one rejection a rewrite can fix. Every
 * other failure -- a banned phrase, Latin letters in the narration, a safety
 * hit -- says something about the angle the model took, and the right answer
 * is a different story. A script that is sixty-seven words when it needed
 * sixty-eight is not the wrong story. It is the right story, told slightly too
 * fast, and throwing away the scripture passage with it spends material that
 * took a database of eight hundred entries to accumulate.
 */
function onlyTooShortOrLong(errors: string[]): boolean {
  return errors.length > 0 && errors.every((error) => /^Script is \d+ words;/.test(error));
}

/** Layer 3: how close is this to anything we have already made? */
async function similarityAgainstHistory(body: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("max_script_similarity", {
    p_body: body,
    p_lookback: 200,
  });
  if (error) {
    // A failure here must not silently disable duplicate protection.
    throw new Error(`max_script_similarity failed: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}

export async function generateVideo(
  options: GenerateOptions = {},
): Promise<GenerationOutcome> {
  const deadline = options.deadline ?? Date.now() + DEFAULT_BUDGET_MS;
  const config = await loadConfig();
  const log: string[] = [];
  const triedTopics: string[] = [];
  const rejectedAngles: string[] = [];
  /** Puranas found empty during this run, so later attempts do not re-ask. */
  const exhaustedPuranas = new Set<string>();
  /** A passage to tell again, and what to say about the last telling of it. */
  let retryTopic: Topic | null = null;
  let lengthFeedback: string | null = null;
  /** One second chance each — a passage that is short twice is not the problem. */
  const retriedForLength = new Set<string>();

  const hook = await buildHookContext();
  log.push(`Context: ${hook.occasion}`);
  if (hook.trends.length > 0) log.push(`Trends in play: ${hook.trends.join(", ")}`);

  const recentTitles = await fetchRecentTitles();
  const learningBrief = await loadLearningBrief(config, log);

  // What the slowest completed attempt cost, used to predict the next one.
  // Measured rather than assumed: a 20-second script on a fast model and a
  // 90-second one on a slow model are not the same bet.
  let slowestAttemptMs = 0;

  for (let attempt = 1; attempt <= config.maxGenerationAttempts; attempt += 1) {
    const remaining = deadline - Date.now();
    const needed = Math.max(MIN_ATTEMPT_BUDGET_MS, slowestAttemptMs);

    if (attempt > 1 && remaining < needed) {
      log.push(
        `Stopped after ${attempt - 1} attempt(s): ${Math.round(remaining / 1000)}s left, ` +
          `and the last attempt took ${Math.round(slowestAttemptMs / 1000)}s.`,
      );
      await recordAttempt(null, attempt - 1, "error", "out of time before the next attempt");
      return {
        ok: false,
        attempts: attempt - 1,
        log,
        error:
          `Ran out of time after ${attempt - 1} attempt(s). Every script written so far was ` +
          `rejected — the log above says why. Press Generate again to continue from where ` +
          `this left off, or lower "Generation attempts before giving up" in Settings.`,
      };
    }

    const attemptStartedAt = Date.now();
    // Consumed by this attempt only: a second failure is not the same failure.
    const feedbackForThisAttempt = lengthFeedback;
    lengthFeedback = null;
    let topic: Topic | null = null;

    try {
      topic = retryTopic ?? (await claimTopic(triedTopics, log, config, exhaustedPuranas));
      retryTopic = null;
      if (!topic) {
        log.push("No unused topics remain in the ledger.");
        await recordAttempt(null, attempt, "no_topics", "topic_ledger exhausted");
        return {
          ok: false,
          attempts: attempt - 1,
          log,
          error:
            "Every topic in the ledger has been used. Run `npm run seed:topics` to add more, or reset times_used on topics you want to revisit.",
        };
      }

      if (!triedTopics.includes(topic.topic_key)) triedTopics.push(topic.topic_key);
      topic = await hydrateTopic(topic);
      log.push(`Attempt ${attempt}: ${topic.scripture} — ${topic.reference} (${topic.title})`);

      // ---- 1. write ----
      const raw = await generateScript(
        {
          cfg: config,
          topic,
          hook,
          recentTitles,
          avoidAngles: rejectedAngles,
          learningBrief,
          lengthFeedback: feedbackForThisAttempt,
        },
        // So "key 1 is out of quota, moving on" reaches the operator rather
        // than dying inside the rotation.
        { log },
      );

      // ---- 2. validate structure + language ----
      const validation = validateScript(raw, config);
      if (!validation.valid) {
        const detail = validation.errors.join(" ");
        const outcome: LogOutcome =
          validation.safetyIssues.length > 0 ? "unsafe" : "invalid";
        log.push(`  rejected (${outcome}): ${detail}`);
        await recordAttempt(topic.topic_key, attempt, outcome, detail);

        // Length alone: keep the passage and tell the model what it hit.
        // Without this, four attempts spend four scripture topics to learn the
        // same lesson four times, and the run ends with nothing written and
        // four fewer stories left to tell.
        if (onlyTooShortOrLong(validation.errors) && !retriedForLength.has(topic.topic_key)) {
          retriedForLength.add(topic.topic_key);
          retryTopic = topic;
          lengthFeedback =
            `YOUR LAST ATTEMPT AT THIS PASSAGE WAS THE RIGHT STORY AND THE WRONG LENGTH\n` +
            `${detail}\n` +
            `Tell the same episode again, at the length asked for below. Do not switch to a ` +
            `different part of the story and do not pad the ending — put the missing words in ` +
            `the middle, as scene: what the place looked like, what was said, what it cost.`;
          log.push("  same passage, one more time, with the word count it actually hit.");
          continue;
        }

        rejectedAngles.push(raw.title);
        await releaseTopic(topic.topic_key);
        continue;
      }

      const script = validation.cleaned;

      // ---- 3. exact-duplicate check ----
      const hash = contentHash(script.script_body);
      const { data: existing } = await supabaseAdmin()
        .from("spiritual_videos")
        .select("id")
        .eq("content_hash", hash)
        .maybeSingle();

      if (existing) {
        log.push("  rejected (duplicate): an identical script already exists.");
        await recordAttempt(topic.topic_key, attempt, "duplicate", `hash ${hash.slice(0, 12)}`);
        rejectedAngles.push(script.title);
        await releaseTopic(topic.topic_key);
        continue;
      }

      // ---- 4. similarity check ----
      const similarity = await similarityAgainstHistory(script.script_body);
      if (similarity > config.similarityThreshold) {
        log.push(
          `  rejected (too similar): ${(similarity * 100).toFixed(1)}% vs. threshold ${(config.similarityThreshold * 100).toFixed(0)}%.`,
        );
        await recordAttempt(
          topic.topic_key,
          attempt,
          "too_similar",
          `similarity ${similarity.toFixed(3)}`,
          similarity,
        );
        rejectedAngles.push(script.title);
        await releaseTopic(topic.topic_key);
        continue;
      }

      // ---- 5. no voice yet ----
      //
      // Narration used to be recorded here, for every script the engine wrote.
      // On this project's free tier that was the wrong way round by an order
      // of magnitude: the text models allow twenty requests a day and the
      // speech model allows ten, so every script rejected on sight was
      // spending the scarcer budget of the two. Seven scripts were rejected in
      // one evening, and seven narrations nobody ever heard went with them.
      //
      // The narration is now recorded by the renderer, after approval, for the
      // one script that is actually going to become a video. That also matches
      // how the operator works: they read the script and decide, rather than
      // listening to it.
      //
      // The cost is that the duration gate — which measured the real MP3,
      // because word count only *predicts* spoken length — cannot run until
      // the render. It still runs there, and a take that comes out too long or
      // too short fails the render loudly instead of reaching YouTube. Until
      // then this is the estimate the deck shows.
      const estimatedSeconds = Number(
        ((validation.wordCount / config.ttsWordsPerMinute) * 60).toFixed(2),
      );
      log.push(
        `  ${validation.wordCount} words ≈ ${estimatedSeconds}s at ${config.ttsWordsPerMinute} wpm; narration is recorded on approval.`,
      );

      // ---- 6. queue it ----
      const { data: inserted, error: insertError } = await supabaseAdmin()
        .from("spiritual_videos")
        .insert({
          status: "pending",
          title: script.title,
          script_body: script.script_body,
          seo_description: script.seo_description,
          hashtags: script.hashtags,
          topic_key: topic.topic_key,
          scripture: topic.scripture,
          reference: topic.reference,
          citation_url: topic.citation_url,
          sanskrit: topic.sanskrit,
          translation: topic.translation,
          translator: topic.translator,
          hook_context: hook.summary,
          content_hash: hash,
          max_similarity: similarity,
          // Audio arrives at render time. duration_seconds holds the estimate
          // until then, and the renderer overwrites it with the measured truth.
          duration_seconds: estimatedSeconds,
          word_count: validation.wordCount,
          tone: script.tone,
          deity: script.deity,
          scene_prompt: script.scene_prompt,
          model: config.geminiModel,
          target_seconds: config.targetSeconds,
          expires_at: new Date(Date.now() + config.rejectTtlHours * 3_600_000).toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        // 23505 = unique violation, i.e. another run inserted the same script
        // between our check and our write. Nothing to clean up any more: no
        // audio was recorded, which is the point of recording it later.
        if (insertError.code === "23505") {
          log.push("  rejected (duplicate): lost an insert race on content_hash.");
          await recordAttempt(topic.topic_key, attempt, "duplicate", "unique violation");
          await releaseTopic(topic.topic_key);
          continue;
        }
        throw new Error(`Insert failed: ${insertError.message}`);
      }

      // ---- 8. burn the topic so it can never be used again ----
      await supabaseAdmin().rpc("consume_topic", { p_topic_key: topic.topic_key });
      await recordAttempt(topic.topic_key, attempt, "accepted", inserted.id, similarity);
      log.push(`  accepted: "${script.title}"`);

      return {
        ok: true,
        video: inserted as SpiritualVideo,
        attempts: attempt,
        log,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.push(`  error: ${message}`);
      await recordAttempt(topic?.topic_key ?? null, attempt, "error", message);
      if (topic) await releaseTopic(topic.topic_key);

      // A spent quota stands the engine down until a key frees up. The
      // refusal has already been remembered — withGeminiTarget records a
      // cooldown against the individual model and key that was refused, which
      // is the only place that knows which one it was. Reaching here means
      // every model on every key has now been refused, so there is nothing
      // left to try this tick.
      if (isQuotaError(message)) {
        const { soonest } = await surveyTargets(
          "text",
          buildTargets(config.geminiApiKeys, config.geminiModels),
        );
        const readable = describeCooldown(soonest || quotaRetrySeconds(message));
        const count = config.geminiApiKeys.length * config.geminiModels.length;
        log.push(
          `  All ${count} model/key combinations are spent. Standing down for ${readable}.`,
        );
        return {
          ok: false,
          attempts: attempt,
          log,
          error:
            `Gemini refused: all ${count} model and key combinations are out of quota. ` +
            `Nothing is wrong with the scripts — none was written. Writing resumes in ${readable}. ` +
            `Adding a key from a different Google account in Settings multiplies the whole ladder again.`,
        };
      }

      // Configuration, credential and dead-model failures will not fix
      // themselves on retry — stop rather than spend three more topics and
      // three more API calls reaching the identical error.
      if (isFatalGenerationError(message)) {
        return { ok: false, attempts: attempt, log, error: message };
      }
    } finally {
      // Runs on every exit from the attempt -- success, rejection, throw --
      // so the estimate is built from what attempts actually cost rather than
      // only from the ones that failed in a particular way.
      slowestAttemptMs = Math.max(slowestAttemptMs, Date.now() - attemptStartedAt);
    }
  }

  return {
    ok: false,
    attempts: config.maxGenerationAttempts,
    log,
    error: `Could not produce an acceptable script in ${config.maxGenerationAttempts} attempts. See the log above and the generation_log table.`,
  };
}
