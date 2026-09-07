/**
 * Every setting, declared once.
 *
 * Three things read this file: the encrypted store (to know what to encrypt),
 * the config loader (to know the fallbacks), and the Settings page (to know
 * what to render). Adding a knob means editing here and nowhere else, which is
 * the whole point — three separate lists would drift within a month.
 */

export type SettingGroup = "connections" | "publishing" | "writing" | "advanced";

export type SettingKind = "text" | "password" | "number" | "boolean" | "select" | "times";

export interface SettingDef {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingKind;
  /** Encrypted at rest, and never returned over HTTP. */
  secret: boolean;
  /** Environment variable consulted when the row is unset. */
  fallbackEnv?: string;
  /** Used when neither the row nor the environment supplies a value. */
  fallback: string;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
}

export const SETTING_DEFS: readonly SettingDef[] = [
  // ---- connections -------------------------------------------------------
  {
    key: "gemini_api_key",
    group: "connections",
    label: "Gemini API key",
    kind: "password",
    secret: true,
    fallbackEnv: "GEMINI_API_KEY",
    fallback: "",
    help: "From aistudio.google.com. The free tier covers eight scripts a day.",
  },
  {
    key: "gemini_model",
    group: "connections",
    label: "Gemini model",
    kind: "text",
    secret: false,
    fallbackEnv: "GEMINI_MODEL",
    fallback: "gemini-2.5-flash",
  },
  {
    key: "youtube_client_id",
    group: "connections",
    label: "YouTube client ID",
    kind: "password",
    secret: true,
    fallbackEnv: "YOUTUBE_CLIENT_ID",
    fallback: "",
  },
  {
    key: "youtube_client_secret",
    group: "connections",
    label: "YouTube client secret",
    kind: "password",
    secret: true,
    fallbackEnv: "YOUTUBE_CLIENT_SECRET",
    fallback: "",
  },
  {
    key: "youtube_refresh_token",
    group: "connections",
    label: "YouTube refresh token",
    kind: "password",
    secret: true,
    fallbackEnv: "YOUTUBE_REFRESH_TOKEN",
    fallback: "",
    help: "Written automatically by the Connect YouTube button.",
  },
  {
    key: "github_owner",
    group: "connections",
    label: "GitHub owner",
    kind: "text",
    secret: false,
    fallbackEnv: "GITHUB_OWNER",
    fallback: "",
  },
  {
    key: "github_repo",
    group: "connections",
    label: "GitHub repo",
    kind: "text",
    secret: false,
    fallbackEnv: "GITHUB_REPO",
    fallback: "",
  },
  {
    key: "github_dispatch_token",
    group: "connections",
    label: "GitHub dispatch token",
    kind: "password",
    secret: true,
    fallbackEnv: "GITHUB_DISPATCH_TOKEN",
    fallback: "",
    help: "A fine-grained token with Actions: read and write on this repo.",
  },

  // ---- publishing --------------------------------------------------------
  {
    key: "posting_times",
    group: "publishing",
    label: "Posting times",
    kind: "times",
    secret: false,
    fallback: '["00:00","04:00"]',
    help: "How many times you list is how many videos go out per day.",
  },
  {
    key: "posting_timezone",
    group: "publishing",
    label: "Timezone",
    kind: "text",
    secret: false,
    fallback: "Asia/Kolkata",
  },
  {
    key: "youtube_privacy",
    group: "publishing",
    label: "Privacy",
    kind: "select",
    secret: false,
    options: ["public", "unlisted", "private"],
    fallbackEnv: "YOUTUBE_PRIVACY_STATUS",
    fallback: "public",
  },

  // ---- writing -----------------------------------------------------------
  {
    key: "scripts_per_day",
    group: "writing",
    label: "Scripts generated per day",
    kind: "number",
    secret: false,
    min: 1,
    max: 30,
    fallback: "8",
    help: "How many you swipe through. Only the ones you approve get published.",
  },
  {
    key: "target_seconds",
    group: "writing",
    label: "Video length (seconds)",
    kind: "number",
    secret: false,
    min: 20,
    max: 90,
    fallbackEnv: "TARGET_SECONDS",
    fallback: "30",
    help: "The word count and the prompt's beat sheet both follow this.",
  },
  {
    key: "word_count_tolerance",
    group: "writing",
    label: "Length tolerance",
    kind: "number",
    secret: false,
    min: 0.05,
    max: 0.4,
    fallbackEnv: "WORD_COUNT_TOLERANCE",
    fallback: "0.15",
  },
  {
    key: "tts_voice",
    group: "writing",
    label: "Voice",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_VOICE",
    fallback: "en-IN-NeerjaNeural",
  },
  {
    key: "tts_rate",
    group: "writing",
    label: "Speaking rate",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_RATE",
    fallback: "-4%",
  },
  {
    key: "tts_words_per_minute",
    group: "writing",
    label: "Measured words per minute",
    kind: "number",
    secret: false,
    min: 60,
    max: 260,
    fallbackEnv: "TTS_WORDS_PER_MINUTE",
    fallback: "148",
    help: "Retune this if you change voice or rate; the word window follows it.",
  },
  {
    key: "similarity_threshold",
    group: "writing",
    label: "Duplicate similarity limit",
    kind: "number",
    secret: false,
    min: 0.1,
    max: 0.9,
    fallbackEnv: "SIMILARITY_THRESHOLD",
    fallback: "0.45",
  },
  {
    key: "learning_enabled",
    group: "writing",
    label: "Learn from retention",
    kind: "boolean",
    secret: false,
    fallback: "true",
  },

  // ---- advanced ----------------------------------------------------------
  {
    key: "reject_ttl_hours",
    group: "advanced",
    label: "Rejected scripts expire after (hours)",
    kind: "number",
    secret: false,
    min: 1,
    max: 168,
    fallback: "24",
  },
  {
    key: "cron_secret",
    group: "advanced",
    label: "Scheduler secret",
    kind: "text",
    // Deliberately NOT secret: the pg_cron job reads this straight from SQL to
    // authenticate its own tick, and SQL cannot decrypt. It authorises nothing
    // beyond triggering the tick.
    secret: false,
    fallbackEnv: "CRON_SECRET",
    fallback: "",
  },
  {
    key: "site_url",
    group: "advanced",
    label: "Site URL",
    kind: "text",
    secret: false,
    fallbackEnv: "NEXT_PUBLIC_SITE_URL",
    fallback: "",
    help: "Used for the YouTube redirect URI and by the scheduler.",
  },
] as const;

const BY_KEY = new Map(SETTING_DEFS.map((def) => [def.key, def]));

export function settingDef(key: string): SettingDef {
  const def = BY_KEY.get(key);
  if (!def) {
    throw new Error(`Unknown setting "${key}". Add it to SETTING_DEFS first.`);
  }
  return def;
}
