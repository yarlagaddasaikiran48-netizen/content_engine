/**
 * The generation pipeline.
 *
 * claim a never-used topic
 *   -> ground it with the real verse text
 *   -> Gemini writes the script
 *   -> validate length, structure and language safety
 *   -> reject if the content hash already exists (layer 2)
 *   -> reject if too similar to recent scripts (layer 3)
 *   -> Edge TTS renders the narration
 *   -> upload the MP3 to Supabase Storage
 *   -> insert the row as 'pending'
 *   -> mark the topic permanently spent
 *
 * Any rejection releases the topic back to the pool and tries a different one,
 * up to MAX_GENERATION_ATTEMPTS. Every outcome is written to generation_log.
 */

import { loadConfig, wordWindow, type AppConfig } from "@/lib/settings/config";
import { contentHash } from "@/lib/dedupe/hash";
import { isFatalGenerationError } from "@/lib/pipeline/fatal";
import { generateScript } from "@/lib/gemini/generate";
import { buildHookContext } from "@/lib/sources/hook";
import { fetchGitaVerse } from "@/lib/sources/gita";
import { rotationFrom } from "@/lib/sources/mahapuranas";
import { deleteAudio, supabaseAdmin, uploadAudio } from "@/lib/supabase/admin";
import { contentTypeFor, extensionFor, speak } from "@/lib/tts";
import { validateScript } from "@/lib/safety/validate";
import type { SpiritualVideo, Topic } from "@/lib/types";

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
  // The audio came out outside the target duration. Distinct from "invalid",
  // which is a word-count guess; these two are measured facts about the MP3.
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
): Promise<Topic | null> {
  if (config.puranaRotation) {
    const rotation = rotationFrom(new Date(), {
      epoch: config.rotationEpoch,
      daysPerPurana: config.rotationDaysPerPurana,
    });

    for (const [offset, purana] of rotation.entries()) {
      const topic = await claimTopicFromScripture(purana.name, exclude);
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function generateVideo(): Promise<GenerationOutcome> {
  const config = await loadConfig();
  const log: string[] = [];
  const triedTopics: string[] = [];
  const rejectedAngles: string[] = [];

  const hook = await buildHookContext();
  log.push(`Context: ${hook.occasion}`);
  if (hook.trends.length > 0) log.push(`Trends in play: ${hook.trends.join(", ")}`);

  const recentTitles = await fetchRecentTitles();

  for (let attempt = 1; attempt <= config.maxGenerationAttempts; attempt += 1) {
    let topic: Topic | null = null;

    try {
      topic = await claimTopic(triedTopics, log, config);
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

      triedTopics.push(topic.topic_key);
      topic = await hydrateTopic(topic);
      log.push(`Attempt ${attempt}: ${topic.scripture} — ${topic.reference} (${topic.title})`);

      // ---- 1. write ----
      const raw = await generateScript({
        cfg: config,
        topic,
        hook,
        recentTitles,
        avoidAngles: rejectedAngles,
      });

      // ---- 2. validate structure + language ----
      const validation = validateScript(raw, config);
      if (!validation.valid) {
        const detail = validation.errors.join(" ");
        const outcome: LogOutcome =
          validation.safetyIssues.length > 0 ? "unsafe" : "invalid";
        log.push(`  rejected (${outcome}): ${detail}`);
        await recordAttempt(topic.topic_key, attempt, outcome, detail);
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

      // ---- 5. voice ----
      const speech = await speak(script.script_body, config, { log });
      log.push(
        `  voiced: ${speech.durationSeconds}s, ${(speech.bytes / 1024).toFixed(0)} KB, ${speech.voice}`,
      );

      // ---- 5b. the duration gate ----
      // Word count only *predicts* spoken length. Long words and heavy
      // punctuation both defeat it, so the real MP3 is the only honest check.
      // This runs before the upload so an overlong take costs no storage and
      // never reaches the review deck.
      const longest = config.targetSeconds * (1 + config.wordCountTolerance);
      const shortest = config.targetSeconds * (1 - config.wordCountTolerance);

      if (speech.durationSeconds > longest) {
        log.push(
          `  rejected (too long): ${speech.durationSeconds.toFixed(1)}s of audio against a ${config.targetSeconds}s target (limit ${longest.toFixed(1)}s).`,
        );
        await recordAttempt(
          topic.topic_key,
          attempt,
          "too_long",
          `${speech.durationSeconds.toFixed(1)}s > ${longest.toFixed(1)}s`,
        );
        rejectedAngles.push(script.title);
        await releaseTopic(topic.topic_key);
        continue;
      }

      if (speech.durationSeconds < shortest) {
        log.push(
          `  rejected (too short): ${speech.durationSeconds.toFixed(1)}s of audio against a ${config.targetSeconds}s target (minimum ${shortest.toFixed(1)}s).`,
        );
        await recordAttempt(
          topic.topic_key,
          attempt,
          "too_short",
          `${speech.durationSeconds.toFixed(1)}s < ${shortest.toFixed(1)}s`,
        );
        rejectedAngles.push(script.title);
        await releaseTopic(topic.topic_key);
        continue;
      }

      // ---- 6. store the audio ----
      const objectPath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${slugify(script.title)}.${extensionFor(speech)}`;
      const { path, publicUrl } = await uploadAudio(objectPath, speech.audio, contentTypeFor(speech));

      // ---- 7. queue it ----
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
          audio_path: path,
          audio_url: publicUrl,
          audio_bytes: speech.bytes,
          duration_seconds: speech.durationSeconds,
          word_count: validation.wordCount,
          voice: speech.voice,
          model: config.geminiModel,
          target_seconds: config.targetSeconds,
          expires_at: new Date(Date.now() + config.rejectTtlHours * 3_600_000).toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        // 23505 = unique violation, i.e. another run inserted the same script
        // between our check and our write.
        await deleteAudio(path);
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

      // Configuration, credential and dead-model failures will not fix
      // themselves on retry — stop rather than spend three more topics and
      // three more API calls reaching the identical error.
      if (isFatalGenerationError(message)) {
        return { ok: false, attempts: attempt, log, error: message };
      }
    }
  }

  return {
    ok: false,
    attempts: config.maxGenerationAttempts,
    log,
    error: `Could not produce an acceptable script in ${config.maxGenerationAttempts} attempts. See the log above and the generation_log table.`,
  };
}
