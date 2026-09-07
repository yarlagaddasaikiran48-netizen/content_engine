/**
 * The typed, merged view of configuration.
 *
 * Precedence, highest first: the app_settings row, then the environment
 * variable named in the catalogue, then the catalogue's own fallback. That
 * order is what lets an operator override a deploy-time value from a phone
 * without ever editing an environment variable again — and it means an
 * existing deployment keeps working unchanged until the first value is saved.
 */

import { SETTING_DEFS, settingDef } from "@/lib/settings/catalogue";
import { readRawSettings } from "@/lib/settings/store";

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;

  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRefreshToken: string;
  youtubePrivacy: string;

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
  ttsVoice: string;
  ttsRate: string;
  ttsWordsPerMinute: number;
  similarityThreshold: number;
  learningEnabled: boolean;

  rejectTtlHours: number;
  cronSecret: string;
  siteUrl: string;
}

type Rows = Map<string, { value: string | null }>;

const DEFAULT_SLOTS = ["00:00", "04:00"];
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Row, then environment, then catalogue fallback. */
function resolve(rows: Rows, key: string): string {
  const def = settingDef(key);
  const row = rows.get(key)?.value;
  if (row !== undefined && row !== null && row !== "") return row;
  if (def.fallbackEnv) {
    const fromEnv = process.env[def.fallbackEnv];
    if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  }
  return def.fallback;
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

function asBoolean(rows: Rows, key: string): boolean {
  return resolve(rows, key) === "true";
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

  return {
    geminiApiKey: resolve(rows, "gemini_api_key"),
    geminiModel: resolve(rows, "gemini_model"),

    youtubeClientId: resolve(rows, "youtube_client_id"),
    youtubeClientSecret: resolve(rows, "youtube_client_secret"),
    youtubeRefreshToken: resolve(rows, "youtube_refresh_token"),
    youtubePrivacy: resolve(rows, "youtube_privacy"),

    githubOwner: resolve(rows, "github_owner"),
    githubRepo: resolve(rows, "github_repo"),
    githubDispatchToken: resolve(rows, "github_dispatch_token"),

    postingTimes,
    postingTimezone: resolve(rows, "posting_timezone"),
    videosPerDay: postingTimes.length,

    scriptsPerDay: asNumber(rows, "scripts_per_day"),
    targetSeconds: asNumber(rows, "target_seconds"),
    wordCountTolerance: asNumber(rows, "word_count_tolerance"),
    ttsVoice: resolve(rows, "tts_voice"),
    ttsRate: resolve(rows, "tts_rate"),
    ttsWordsPerMinute: asNumber(rows, "tts_words_per_minute"),
    similarityThreshold: asNumber(rows, "similarity_threshold"),
    learningEnabled: asBoolean(rows, "learning_enabled"),

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
