/**
 * Bootstrap configuration.
 *
 * MIGRATION IN PROGRESS. Configuration now lives in the database — see
 * src/lib/settings/config.ts and `loadConfig()`. Two categories are allowed to
 * stay here permanently:
 *
 *  - Values needed to *reach* the database (the Supabase URL and service key).
 *    A database cannot hold its own password.
 *  - DASHBOARD_PASSWORD, read by edge middleware, which cannot decrypt.
 *
 * Everything else below is superseded and will be deleted once its call sites
 * read `loadConfig()` instead. Until then both paths exist, and the database
 * value wins wherever a call site has already been migrated.
 *
 * Rules of the house:
 *  - `required()` throws loudly at call time (never at import time, so a
 *    missing YouTube key can't break an unrelated page render).
 *  - Anything with a sane default lives in `config`.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (local) or Vercel → Settings → Environment Variables (production). See .env.example.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  get youtubeClientId() {
    return required("YOUTUBE_CLIENT_ID");
  },
  get youtubeClientSecret() {
    return required("YOUTUBE_CLIENT_SECRET");
  },
  get youtubeRefreshToken() {
    return required("YOUTUBE_REFRESH_TOKEN");
  },
  get githubOwner() {
    return required("GITHUB_OWNER");
  },
  get githubRepo() {
    return required("GITHUB_REPO");
  },
  get githubDispatchToken() {
    return required("GITHUB_DISPATCH_TOKEN");
  },
};

export const config = {
  audioBucket: optional("SUPABASE_AUDIO_BUCKET", "spiritual-audio"),

  geminiModel: optional("GEMINI_MODEL", "gemini-3.6-flash"),
  geminiThinkingBudget: num("GEMINI_THINKING_BUDGET", 512),

  ttsVoice: optional("TTS_VOICE", "en-IN-NeerjaNeural"),
  ttsRate: optional("TTS_RATE", "-4%"),
  ttsPitch: optional("TTS_PITCH", "+0Hz"),
  ttsVolume: optional("TTS_VOLUME", "+0%"),

  /**
   * Daily Maha Purana rotation. On by default: the engine walks the eighteen
   * Puranas in their traditional order, one per day. Set PURANA_ROTATION=off
   * to fall back to weighted-random selection across the whole ledger.
   */
  puranaRotation: optional("PURANA_ROTATION", "on") !== "off",
  /** Day zero of the cycle. Any parseable date; defaults to the Unix epoch. */
  rotationEpoch: (() => {
    const raw = optional("ROTATION_EPOCH");
    const parsed = raw ? new Date(raw) : null;
    return parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : new Date(Date.UTC(1970, 0, 1));
  })(),
  /** Days spent on each Purana before advancing. */
  rotationDaysPerPurana: num("ROTATION_DAYS_PER_PURANA", 1),

  /**
   * Target spoken length of a Short, in seconds. Everything downstream that
   * cares about length derives from this — the word window in the validator,
   * the guidance in the prompt, the render duration hint.
   */
  targetSeconds: num("TARGET_SECONDS", 30),
  /**
   * Measured speaking rate of the configured voice. en-IN-NeerjaNeural at
   * rate -4% renders 26 words in 10.51s = 148 wpm. Retune this if you change
   * TTS_VOICE or TTS_RATE, and the word window follows.
   */
  speechWordsPerMinute: num("TTS_WORDS_PER_MINUTE", 148),
  /** How far either side of the ideal word count is still acceptable. */
  wordCountTolerance: num("WORD_COUNT_TOLERANCE", 0.15),
  similarityThreshold: num("SIMILARITY_THRESHOLD", 0.45),
  maxGenerationAttempts: num("MAX_GENERATION_ATTEMPTS", 4),

  youtubePrivacy: optional("YOUTUBE_PRIVACY_STATUS", "public"),
  youtubeCategoryId: optional("YOUTUBE_CATEGORY_ID", "22"),
  youtubeMadeForKids: optional("YOUTUBE_MADE_FOR_KIDS", "false") === "true",

  siteUrl: optional("NEXT_PUBLIC_SITE_URL", "").replace(/\/+$/, ""),
  publishCallbackSecret: optional("PUBLISH_CALLBACK_SECRET"),
  cronSecret: optional("CRON_SECRET"),
  dashboardPassword: optional("DASHBOARD_PASSWORD"),
} as const;

/** Feature flags derived from which credentials actually exist. */
export const features = {
  get githubRenderer(): boolean {
    return Boolean(
      optional("GITHUB_OWNER") &&
        optional("GITHUB_REPO") &&
        optional("GITHUB_DISPATCH_TOKEN"),
    );
  },
  get youtube(): boolean {
    return Boolean(
      optional("YOUTUBE_CLIENT_ID") &&
        optional("YOUTUBE_CLIENT_SECRET") &&
        optional("YOUTUBE_REFRESH_TOKEN"),
    );
  },
  get passwordGate(): boolean {
    return Boolean(optional("DASHBOARD_PASSWORD"));
  },
};
