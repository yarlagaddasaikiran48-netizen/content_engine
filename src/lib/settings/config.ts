/**
 * The typed, merged view of configuration.
 *
 * Precedence, highest first: the app_settings row, then the environment
 * variable named in the catalogue, then the catalogue's own fallback. That
 * order is what lets an operator override a deploy-time value from a phone
 * without ever editing an environment variable again — and it means an
 * existing deployment keeps working unchanged until the first value is saved.
 */

import { usableKeys } from "@/lib/gemini/keys";
import { effectiveValue, SETTING_DEFS, settingDef } from "@/lib/settings/catalogue";
import { readRawSettings } from "@/lib/settings/store";

export interface AppConfig {
  /**
   * The first key set, or "". Kept because most callers want one key and do
   * not care that there may be others; anything that spends quota should use
   * `geminiApiKeys` and rotate.
   */
  geminiApiKey: string;
  /** Every key set, in the order Settings lists them, blanks and duplicates dropped. */
  geminiApiKeys: string[];
  geminiModel: string;
  /**
   * The text models to spend, best first, starting with `geminiModel`. Each
   * has its own daily quota on the same key — see lib/gemini/rotate.ts.
   */
  geminiModels: string[];
  /** The voice models to spend, best first. Edge answers after all are spent. */
  geminiTtsModels: string[];
  /** The image models to spend, best first. Metered apart from both of those. */
  imageModels: string[];
  geminiThinkingBudget: number;

  /** Off falls the renderer back to filed artwork, then to the gradient. */
  imagesEnabled: boolean;
  imageSecondsPerShot: number;
  imageMaxShots: number;
  /** Milliseconds between image requests — the free tier allows about two a minute. */
  imagePaceMs: number;
  imageCrossfadeSeconds: number;

  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRefreshToken: string;
  autoPublish: boolean;
  youtubePrivacy: string;
  youtubeCategoryId: string;
  youtubeMadeForKids: boolean;

  githubOwner: string;
  githubRepo: string;
  githubDispatchToken: string;

  postingTimes: string[];
  postingTimezone: string;
  /** Derived: one video per configured slot. Never stored separately. */
  videosPerDay: number;

  scriptsPerDay: number;
  targetSeconds: number;
  wordCountTolerance: number;
  ttsProvider: string;
  ttsVoice: string;
  ttsVoiceIntense: string;
  ttsGeminiVoice: string;
  ttsGeminiVoiceIntense: string;
  ttsStylePrompt: string;
  ttsStylePromptIntense: string;
  ttsRate: string;
  ttsPitch: string;
  ttsVolume: string;
  ttsWordsPerMinute: number;
  endCardText: string;
  endCardSeconds: number;
  similarityThreshold: number;
  learningEnabled: boolean;
  puranaRotation: boolean;
  rotationEpoch: Date;
  rotationDaysPerPurana: number;
  maxGenerationAttempts: number;
  audioBucket: string;
  publishCallbackSecret: string;

  rejectTtlHours: number;
  cronSecret: string;
  siteUrl: string;
}

type Rows = Map<string, { value: string | null }>;

const DEFAULT_SLOTS = ["00:00", "04:00"];
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Row, then environment, then catalogue fallback — defined in catalogue.ts. */
function resolve(rows: Rows, key: string): string {
  return effectiveValue(settingDef(key), rows.get(key)?.value);
}

/**
 * Clamped to the catalogue's own bounds rather than trusted. The Settings form
 * enforces min/max too, but a value can also arrive from an environment
 * variable or a hand-edited row, and a target of 600 seconds would produce a
 * word window no model could hit.
 */
function asNumber(rows: Rows, key: string): number {
  const def = settingDef(key);
  const parsed = Number(resolve(rows, key));
  if (!Number.isFinite(parsed)) return Number(def.fallback);
  if (def.min !== undefined && parsed < def.min) return def.min;
  if (def.max !== undefined && parsed > def.max) return def.max;
  return parsed;
}

/** An unparseable or blank date means the Unix epoch, never NaN. */
function asDate(rows: Rows, key: string): Date {
  const raw = resolve(rows, key);
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.UTC(1970, 0, 1));
}

function asBoolean(rows: Rows, key: string): boolean {
  return resolve(rows, key) === "true";
}

/**
 * The primary model followed by its fallbacks, best first.
 *
 * Deduped because the primary is very often also named in the fallback list —
 * an operator moving a model up the ladder edits one field and forgets the
 * other — and a duplicate would spend a second refused request proving a
 * budget we already know is gone.
 */
function asModelChain(primary: string, fallbacks: string): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];

  for (const candidate of [primary, ...fallbacks.split(/[,\n]/)]) {
    const model = candidate.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    chain.push(model);
  }

  return chain;
}

function asTimes(rows: Rows): string[] {
  try {
    const parsed: unknown = JSON.parse(resolve(rows, "posting_times"));
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((t) => typeof t === "string" && HH_MM.test(t))
    ) {
      return parsed as string[];
    }
  } catch {
    // Malformed JSON falls through to the defaults below.
  }
  // Never return an empty list: that would silently mean "publish nothing".
  return DEFAULT_SLOTS;
}

export async function loadConfig(): Promise<AppConfig> {
  const rows = await readRawSettings();
  const postingTimes = asTimes(rows);
  const geminiApiKeys = usableKeys([
    resolve(rows, "gemini_api_key"),
    resolve(rows, "gemini_api_key_2"),
    resolve(rows, "gemini_api_key_3"),
  ]);

  return {
    geminiApiKey: geminiApiKeys[0] ?? "",
    geminiApiKeys,
    geminiModel: resolve(rows, "gemini_model"),
    geminiModels: asModelChain(resolve(rows, "gemini_model"), resolve(rows, "gemini_model_fallbacks")),
    geminiTtsModels: asModelChain(
      resolve(rows, "gemini_tts_model"),
      resolve(rows, "gemini_tts_model_fallbacks"),
    ),
    imageModels: asModelChain(resolve(rows, "image_model"), resolve(rows, "image_model_fallbacks")),
    geminiThinkingBudget: asNumber(rows, "gemini_thinking_budget"),

    imagesEnabled: asBoolean(rows, "images_enabled"),
    imageSecondsPerShot: asNumber(rows, "image_seconds_per_shot"),
    imageMaxShots: asNumber(rows, "image_max_shots"),
    imagePaceMs: asNumber(rows, "image_pace_ms"),
    imageCrossfadeSeconds: asNumber(rows, "image_crossfade_seconds"),

    youtubeClientId: resolve(rows, "youtube_client_id"),
    youtubeClientSecret: resolve(rows, "youtube_client_secret"),
    youtubeRefreshToken: resolve(rows, "youtube_refresh_token"),
    autoPublish: asBoolean(rows, "auto_publish"),
    youtubePrivacy: resolve(rows, "youtube_privacy"),
    youtubeCategoryId: resolve(rows, "youtube_category_id"),
    youtubeMadeForKids: asBoolean(rows, "youtube_made_for_kids"),

    githubOwner: resolve(rows, "github_owner"),
    githubRepo: resolve(rows, "github_repo"),
    githubDispatchToken: resolve(rows, "github_dispatch_token"),

    postingTimes,
    postingTimezone: resolve(rows, "posting_timezone"),
    videosPerDay: postingTimes.length,

    scriptsPerDay: asNumber(rows, "scripts_per_day"),
    targetSeconds: asNumber(rows, "target_seconds"),
    wordCountTolerance: asNumber(rows, "word_count_tolerance"),
    ttsProvider: resolve(rows, "tts_provider"),
    ttsVoice: resolve(rows, "tts_voice"),
    ttsVoiceIntense: resolve(rows, "tts_voice_intense"),
    ttsGeminiVoice: resolve(rows, "tts_gemini_voice"),
    ttsGeminiVoiceIntense: resolve(rows, "tts_gemini_voice_intense"),
    ttsStylePrompt: resolve(rows, "tts_style_prompt"),
    ttsStylePromptIntense: resolve(rows, "tts_style_prompt_intense"),
    ttsRate: resolve(rows, "tts_rate"),
    ttsPitch: resolve(rows, "tts_pitch"),
    ttsVolume: resolve(rows, "tts_volume"),
    ttsWordsPerMinute: asNumber(rows, "tts_words_per_minute"),
    endCardText: resolve(rows, "end_card_text"),
    endCardSeconds: asNumber(rows, "end_card_seconds"),
    similarityThreshold: asNumber(rows, "similarity_threshold"),
    learningEnabled: asBoolean(rows, "learning_enabled"),
    puranaRotation: asBoolean(rows, "purana_rotation"),
    rotationEpoch: asDate(rows, "rotation_epoch"),
    rotationDaysPerPurana: asNumber(rows, "rotation_days_per_purana"),
    maxGenerationAttempts: asNumber(rows, "max_generation_attempts"),
    audioBucket: resolve(rows, "supabase_audio_bucket"),
    publishCallbackSecret: resolve(rows, "publish_callback_secret"),

    rejectTtlHours: asNumber(rows, "reject_ttl_hours"),
    cronSecret: resolve(rows, "cron_secret"),
    siteUrl: resolve(rows, "site_url").replace(/\/+$/, ""),
  };
}

/**
 * For credentials, where "missing" must stop the caller rather than proceed
 * with an empty string. The message names the human label and the page that
 * fixes it, because that error is the operator's only diagnostic.
 */
export async function requireSetting(key: string): Promise<string> {
  const rows = await readRawSettings();
  const value = resolve(rows, key);
  if (!value || value.trim() === "") {
    throw new Error(
      `${settingDef(key).label} is not set. Open Settings and add it, then try again.`,
    );
  }
  return value;
}

/**
 * The one place a target duration becomes a word count. Everything that cares
 * about length — the prompt, the validator, the duration gate — reads this, so
 * they cannot disagree about what "thirty seconds" means.
 */
export function wordWindow(cfg: AppConfig): { ideal: number; min: number; max: number } {
  const ideal = Math.round((cfg.targetSeconds * cfg.ttsWordsPerMinute) / 60);
  return {
    ideal,
    min: Math.round(ideal * (1 - cfg.wordCountTolerance)),
    max: Math.round(ideal * (1 + cfg.wordCountTolerance)),
  };
}

/** Names of every catalogue key, for callers that iterate. */
export const SETTING_KEYS = SETTING_DEFS.map((d) => d.key);
