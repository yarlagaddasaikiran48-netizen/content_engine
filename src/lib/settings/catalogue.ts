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
  // Google meters the free tier per *project*, not per key, so a second key
  // cut from this same Google account adds nothing. These two fields are for
  // keys from somebody else's account — each of those is a separate project
  // and a separate daily budget. When one is refused the engine moves to the
  // next instead of standing down for the rest of the day.
  {
    key: "gemini_api_key_2",
    group: "connections",
    label: "Gemini API key 2 (optional)",
    kind: "password",
    secret: true,
    fallbackEnv: "GEMINI_API_KEY_2",
    fallback: "",
    help: "A key from a different Google account — a friend's. Doubles the day's scripts. A second key from your own account does nothing: the quota is per Google project, not per key.",
  },
  {
    key: "gemini_api_key_3",
    group: "connections",
    label: "Gemini API key 3 (optional)",
    kind: "password",
    secret: true,
    fallbackEnv: "GEMINI_API_KEY_3",
    fallback: "",
    help: "A third account, if you have one. Used only after keys 1 and 2 are both refused.",
  },
  {
    key: "gemini_model",
    group: "connections",
    label: "Gemini model",
    kind: "text",
    secret: false,
    fallbackEnv: "GEMINI_MODEL",
    fallback: "gemini-3.6-flash",
    help: "The model that writes first, while it has quota. The best one you have.",
  },
  // Google meters each model separately, and the free-tier allowances differ
  // by more than an order of magnitude: gemini-3.6-flash gives 20 requests a
  // day, gemini-3.1-flash-lite gives 500 on the very same key. Written
  // best-first — the engine only comes down this ladder as the better models
  // run out, so quality degrades only when there is no way left to avoid it.
  {
    key: "gemini_model_fallbacks",
    group: "connections",
    label: "Fall back to these models",
    kind: "text",
    secret: false,
    fallbackEnv: "GEMINI_MODEL_FALLBACKS",
    fallback:
      "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3-flash,gemini-2.5-flash,gemini-3.1-flash-lite,gemini-3.5-flash-lite",
    help: "Comma-separated, best first. Each has its own daily quota on the same key, so this is worth far more than a second key: roughly 1,100 requests a day instead of 20. A name Google does not know is skipped automatically.",
  },
  {
    key: "gemini_tts_model",
    group: "writing",
    label: "Gemini voice model",
    kind: "text",
    secret: false,
    fallbackEnv: "GEMINI_TTS_MODEL",
    fallback: "gemini-3.1-flash-tts-preview",
    help: "Only 10 requests a day on the free tier — which is why narration is now recorded when you approve a script, not when it is written.",
  },
  {
    key: "gemini_tts_model_fallbacks",
    group: "writing",
    label: "Fall back to these voice models",
    kind: "text",
    secret: false,
    fallbackEnv: "GEMINI_TTS_MODEL_FALLBACKS",
    fallback: "gemini-2.5-flash-tts-preview",
    help: "Comma-separated, best first. After all of these are spent the narration falls through to Edge, which is free and unlimited.",
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
    key: "youtube_category_id",
    group: "publishing",
    label: "YouTube category ID",
    kind: "text",
    secret: false,
    fallbackEnv: "YOUTUBE_CATEGORY_ID",
    fallback: "22",
    help: "22 is People & Blogs. 24 is Entertainment.",
  },
  {
    key: "youtube_made_for_kids",
    group: "publishing",
    label: "Made for kids",
    kind: "boolean",
    secret: false,
    fallback: "false",
  },
  {
    key: "auto_publish",
    group: "publishing",
    label: "Post automatically at each slot",
    kind: "boolean",
    secret: false,
    // Off by default: the operator asked to watch each video before it goes
    // out, and a default that publishes unseen work would defeat that.
    fallback: "false",
    help: "Off means videos render and wait for you to press Post. On means each slot posts the oldest ready video by itself.",
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
    fallback: "60",
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
    key: "tts_provider",
    group: "writing",
    label: "Voice engine",
    kind: "select",
    secret: false,
    options: ["gemini", "edge"],
    fallbackEnv: "TTS_PROVIDER",
    fallback: "gemini",
    help: "Gemini takes spoken direction and sounds human; Edge is flat but never rate-limited. Gemini falls back to Edge on its own if a call fails.",
  },
  {
    key: "tts_voice",
    group: "writing",
    label: "Gentle-script voice (Edge)",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_VOICE",
    fallback: "te-IN-ShrutiNeural",
    help: "A woman's voice, for teaching, devotion and consolation. te-IN-ShrutiNeural is the Telugu one.",
  },
  {
    key: "tts_voice_intense",
    group: "writing",
    label: "Fierce-script voice (Edge)",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_VOICE_INTENSE",
    fallback: "te-IN-MohanNeural",
    help: "A man's voice, for wrath, war, curses and death. te-IN-MohanNeural is the Telugu one.",
  },
  {
    key: "tts_gemini_voice",
    group: "writing",
    label: "Gentle-script voice (Gemini)",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_GEMINI_VOICE",
    fallback: "Kore",
    help: "A woman's prebuilt Gemini voice. Listen to a few at aistudio.google.com/generate-speech and paste the one you like.",
  },
  {
    key: "tts_gemini_voice_intense",
    group: "writing",
    label: "Fierce-script voice (Gemini)",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_GEMINI_VOICE_INTENSE",
    fallback: "Charon",
    help: "A man's prebuilt Gemini voice, used when the model marks an episode as fierce.",
  },
  {
    key: "tts_style_prompt",
    group: "writing",
    label: "Direction — gentle scripts",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_STYLE_PROMPT",
    fallback:
      "An elderly Telugu storyteller telling one of the Puranas aloud at night, to someone sitting close. Unhurried and warm, never announcing. Let the sentences breathe, and drop almost to a whisper at the turn of the story. Sound like a person remembering it, not like someone reading it.",
    help: "Gemini only. Plain language, the way you would direct a voice actor: who is speaking, where, and at what pace.",
  },
  {
    key: "tts_style_prompt_intense",
    group: "writing",
    label: "Direction — fierce scripts",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_STYLE_PROMPT_INTENSE",
    fallback:
      "A Telugu storyteller telling the fiercest part of a Purana — a curse, a war, a god's judgement. Grave and deliberate, weight behind every line, never shouting. Slow down where it is most frightening rather than speeding up. Sound like a person who believes it happened.",
    help: "Gemini only. Used when the model marks an episode as fierce. Restraint carries menace better than volume.",
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
    fallback: "80",
    help: "Retune this if you change voice or rate; the word window follows it.",
  },
  // Drawn over the closing beat, not spoken. A spoken CTA costs words out of a
  // sixty-second budget and lands as an ad in the middle of a story, which is
  // why the writing prompt bans it from the narration outright.
  {
    key: "end_card_text",
    group: "writing",
    label: "Subscribe card text",
    kind: "text",
    secret: false,
    fallbackEnv: "END_CARD_TEXT",
    fallback: "సబ్‌స్క్రైబ్ చేయండి",
    help: "Shown over the last seconds of every video. Leave blank for no end card.",
  },
  {
    key: "end_card_seconds",
    group: "writing",
    label: "Subscribe card — seconds held",
    kind: "number",
    secret: false,
    fallbackEnv: "END_CARD_SECONDS",
    min: 0,
    max: 10,
    fallback: "2",
    help: "How long it stays on screen at the end.",
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
    key: "tts_pitch",
    group: "writing",
    label: "Pitch",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_PITCH",
    fallback: "+0Hz",
  },
  {
    key: "tts_volume",
    group: "writing",
    label: "Volume",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_VOLUME",
    fallback: "+0%",
  },
  {
    key: "purana_rotation",
    group: "writing",
    label: "Daily Maha Purana rotation",
    kind: "boolean",
    secret: false,
    fallback: "true",
    help: "Walk the eighteen Puranas in order, one per day. Off means weighted-random across the whole ledger.",
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
    key: "gemini_thinking_budget",
    group: "advanced",
    label: "Gemini thinking budget",
    kind: "number",
    secret: false,
    min: 0,
    max: 24576,
    fallbackEnv: "GEMINI_THINKING_BUDGET",
    fallback: "512",
  },
  {
    key: "max_generation_attempts",
    group: "advanced",
    label: "Generation attempts before giving up",
    kind: "number",
    secret: false,
    min: 1,
    max: 10,
    fallbackEnv: "MAX_GENERATION_ATTEMPTS",
    fallback: "4",
  },
  {
    key: "rotation_days_per_purana",
    group: "advanced",
    label: "Days per Purana",
    kind: "number",
    secret: false,
    min: 1,
    max: 30,
    fallbackEnv: "ROTATION_DAYS_PER_PURANA",
    fallback: "1",
  },
  {
    key: "rotation_epoch",
    group: "advanced",
    label: "Rotation start date",
    kind: "text",
    secret: false,
    fallbackEnv: "ROTATION_EPOCH",
    fallback: "",
    help: "Any parseable date. Blank means the Unix epoch.",
  },
  {
    key: "supabase_audio_bucket",
    group: "advanced",
    label: "Audio storage bucket",
    kind: "text",
    secret: false,
    fallbackEnv: "SUPABASE_AUDIO_BUCKET",
    fallback: "spiritual-audio",
  },
  {
    key: "publish_callback_secret",
    group: "advanced",
    label: "Publish callback secret",
    kind: "password",
    secret: true,
    fallbackEnv: "PUBLISH_CALLBACK_SECRET",
    fallback: "",
    help: "Shared with the render workflow so it can report back.",
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

/**
 * The precedence rule, in one place: stored row, then environment variable,
 * then the catalogue fallback.
 *
 * It lives here rather than in the config loader because the Settings form
 * needs it too — a field showing blank when the engine is actually using
 * the catalogue fallback reads as broken. Two copies of this rule would drift.
 */
export function effectiveValue(def: SettingDef, stored: string | null | undefined): string {
  if (stored !== undefined && stored !== null && stored !== "") return stored;
  if (def.fallbackEnv) {
    const fromEnv = process.env[def.fallbackEnv];
    if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  }
  return def.fallback;
}
