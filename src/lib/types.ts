export type VideoStatus =
  | "pending"
  | "approved"
  | "rendering"
  // Rendered and watchable, not yet on YouTube.
  | "ready"
  | "published"
  | "rejected"
  | "failed";

export type TopicSource = "gita" | "purana" | "upanishad";

/** One row of `topic_ledger` — a real, citable scripture topic. */
export interface Topic {
  topic_key: string;
  source: TopicSource;
  scripture: string;
  reference: string;
  title: string;
  theme: string;
  summary: string;
  sanskrit: string | null;
  translation: string | null;
  translator: string | null;
  citation_url: string;
  weight: number;
  times_used: number;
  last_used_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

/** One row of `spiritual_videos` — an item in the approval queue. */
export interface SpiritualVideo {
  id: string;
  created_at: string;
  updated_at: string;
  status: VideoStatus;

  title: string;
  script_body: string;
  seo_description: string;
  hashtags: string[];

  topic_key: string | null;
  scripture: string | null;
  reference: string | null;
  citation_url: string | null;
  sanskrit: string | null;
  translation: string | null;
  translator: string | null;
  hook_context: string | null;

  content_hash: string;
  max_similarity: number | null;

  audio_path: string | null;
  audio_url: string | null;
  audio_bytes: number | null;
  duration_seconds: number | null;
  word_count: number | null;
  voice: string;

  youtube_video_id: string | null;
  youtube_url: string | null;
  published_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  error_message: string | null;
  render_attempts: number;

  // ---- review deck and publish queue (migration 001) --------------------
  /** Rejected and unreviewed scripts delete themselves at this time. */
  expires_at: string | null;
  /** Operator-chosen publish order. */
  queue_position: number | null;
  /** Set only when a slot is pinned by hand; normally derived. */
  scheduled_for: string | null;
  /** The length this script was written for. */
  target_seconds: number | null;
  /** First time this card reached the top of the deck. */
  seen_at: string | null;
  /** Which configured slot this filled, e.g. "00:00". */
  published_slot: string | null;

  // ---- rendered file, watchable before publishing (migration 003) --------
  video_path: string | null;
  video_url: string | null;
  video_bytes: number | null;
  rendered_at: string | null;

  model: string;
}

export interface QueueStats {
  pending: number;
  approved: number;
  rendering: number;
  published: number;
  rejected: number;
  failed: number;
  topics_remaining: number;
  topics_total: number;
}

/** Exactly what Gemini is contractually required to return. */
export interface GeneratedScript {
  title: string;
  script_body: string;
  seo_description: string;
  hashtags: string[];
}

/** The "why today" angle: real calendar + real trends, never invented. */
export interface HookContext {
  /** One-line summary handed to the LLM and stored on the row. */
  summary: string;
  /** Panchang-derived occasion, e.g. "Ekadashi (Shukla Paksha, Kartika)". */
  occasion: string;
  /** Trending Indian search terms judged relevant to spiritual content. */
  trends: string[];
  /** Season/festival rule that fired, if any. */
  festival: string | null;
}
