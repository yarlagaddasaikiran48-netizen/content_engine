/**
 * Bhagavad Gita source.
 *
 * Uses the open, key-free Vedic Scriptures API (https://vedicscriptures.github.io),
 * which serves all 18 chapters and 700 verses as JSON: the Sanskrit shloka, its
 * transliteration, and a dozen English translations.
 *
 * WHY THIS MATTERS: the LLM is never asked to recall a verse from memory. It is
 * handed the real Sanskrit and a real published translation and told to explain
 * *that*. A wrong or invented verse is therefore not possible.
 */

export interface GitaVerse {
  chapter: number;
  verse: number;
  sanskrit: string;
  transliteration: string;
  translation: string;
  translator: string;
  citationUrl: string;
}

export interface GitaChapter {
  chapter_number: number;
  verses_count: number;
  name: string;
  translation: string;
  transliteration: string;
  meaning: { en: string; hi: string };
  summary: { en: string; hi: string };
}

const API_BASE = "https://vedicscriptures.github.io";

/**
 * Translation preference order.
 *
 * These are all scholarly translations in the public domain or freely
 * redistributed. Prabhupada's rendering ("prabhu") is deliberately excluded:
 * it is under active copyright by the BBT and must not be recited in
 * monetised video.
 */
const TRANSLATOR_PREFERENCE = [
  "siva", // Swami Sivananda — plain, direct, reads beautifully aloud
  "gambir", // Swami Gambirananda
  "purohit", // Shri Purohit Swami
  "adi", // Swami Adidevananda
  "san", // Dr. S. Sankaranarayan
  "raman", // Sri Ramanuja
  "abhinav", // Sri Abhinav Gupta
] as const;

interface SlokResponse {
  chapter: number;
  verse: number;
  slok: string;
  transliteration: string;
  [translatorKey: string]:
    | string
    | number
    | { author?: string; et?: string; ht?: string; ec?: string; hc?: string };
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      // The dataset is static; let the platform cache it for a day.
      next: { revalidate: 86_400 },
    });
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip the trailing "2.47" reference many translations prepend. */
function cleanTranslation(text: string, chapter: number, verse: number): string {
  return text
    .replace(new RegExp(`^\\s*${chapter}\\.${verse}\\.?\\s*`), "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch one verse with the best available English translation. */
export async function fetchGitaVerse(
  chapter: number,
  verse: number,
): Promise<GitaVerse | null> {
  const data = await fetchJson<SlokResponse>(`${API_BASE}/slok/${chapter}/${verse}`);

  for (const key of TRANSLATOR_PREFERENCE) {
    const entry = data[key];
    if (entry && typeof entry === "object" && typeof entry.et === "string") {
      const translation = cleanTranslation(entry.et, chapter, verse);
      // Very short entries are usually placeholders, not real translations.
      if (translation.length > 40) {
        return {
          chapter,
          verse,
          sanskrit: (data.slok ?? "").replace(/\s+/g, " ").trim(),
          transliteration: (data.transliteration ?? "").replace(/\s+/g, " ").trim(),
          translation,
          translator: entry.author ?? key,
          citationUrl: `${API_BASE}/slok/${chapter}/${verse}`,
        };
      }
    }
  }
  return null;
}

/** Chapter metadata — names, verse counts and summaries for all 18 chapters. */
export async function fetchGitaChapters(): Promise<GitaChapter[]> {
  return fetchJson<GitaChapter[]>(`${API_BASE}/chapters`);
}

/**
 * A coarse theme label per chapter, used to give the topic ledger a searchable
 * `theme` and to help the LLM pick the right emotional register.
 */
export const CHAPTER_THEMES: Record<number, string> = {
  1: "facing despair and moral confusion",
  2: "the eternal self and steady wisdom",
  3: "selfless action and duty",
  4: "knowledge, renunciation and divine descent",
  5: "acting without attachment",
  6: "meditation and mastery of the mind",
  7: "knowledge of the absolute",
  8: "the imperishable and the final thought",
  9: "devotion as the royal secret",
  10: "divine glories in all things",
  11: "the universal form and awe",
  12: "the path of loving devotion",
  13: "the field and the knower of the field",
  14: "rising above the three gunas",
  15: "the eternal tree and the supreme person",
  16: "divine versus demonic nature",
  17: "faith, food, austerity and charity",
  18: "liberation through surrender",
};
