/**
 * Central, typed access to configuration.
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

  geminiModel: optional("GEMINI_MODEL", "gemini-2.5-flash"),
  geminiThinkingBudget: num("GEMINI_THINKING_BUDGET", 512),

  ttsVoice: optional("TTS_VOICE", "en-IN-NeerjaNeural"),
  ttsRate: optional("TTS_RATE", "-4%"),
  ttsPitch: optional("TTS_PITCH", "+0Hz"),
  ttsVolume: optional("TTS_VOLUME", "+0%"),

  targetSeconds: num("TARGET_SECONDS", 30),
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
