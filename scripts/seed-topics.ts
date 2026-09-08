/**
 * Seed the topic ledger.
 *
 *   npm run seed:topics
 *
 * Loads every one of the 700 Bhagavad Gita verses from the free Vedic
 * Scriptures API — Sanskrit, transliteration and a public-domain English
 * translation for each — plus the curated Purana / Upanishad / Ramayana corpus.
 *
 * Re-running is safe and idempotent: rows are inserted with ON CONFLICT DO
 * NOTHING, so topics you have already used keep their `times_used` and are
 * never handed out a second time.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import {
  CHAPTER_THEMES,
  fetchGitaChapters,
  fetchGitaVerse,
  type GitaChapter,
} from "../src/lib/sources/gita";
import { citationUrlFor, MAHA_PURANAS } from "../src/lib/sources/mahapuranas";
import { buildChapterRow, isUsableChapter } from "../src/lib/sources/purana-chapters";
import { assertUniqueKeys, CORPUS } from "../src/lib/sources/puranas";
import { fetchChapter, fetchChapterIndex } from "../src/lib/sources/wisdomlib";

interface LedgerRow {
  topic_key: string;
  source: "gita" | "purana" | "upanishad";
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
}

/**
 * Verses that are widely known and land hardest as a Short. They get a higher
 * weight so the channel opens strong before moving into deeper cuts.
 */
const SIGNATURE_VERSES = new Set([
  "2.47", "2.13", "2.20", "2.22", "2.62", "2.63", "2.70", "3.35",
  "4.7", "4.8", "6.5", "6.6", "6.35", "9.22", "12.13", "12.15",
  "15.7", "16.21", "18.66", "18.78", "2.48", "3.21", "5.10", "7.16",
]);

function weightFor(chapter: number, verse: number): number {
  const key = `${chapter}.${verse}`;
  if (SIGNATURE_VERSES.has(key)) return 200;
  // Chapters 2, 12 and 18 are the most quotable overall.
  if ([2, 12, 18].includes(chapter)) return 140;
  if ([3, 4, 6, 9].includes(chapter)) return 120;
  return 100;
}

/** Run `worker` over `items` with bounded concurrency. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function buildGitaRows(chapters: GitaChapter[]): Promise<LedgerRow[]> {
  const targets: Array<{ chapter: number; verse: number }> = [];
  for (const chapter of chapters) {
    for (let verse = 1; verse <= chapter.verses_count; verse += 1) {
      targets.push({ chapter: chapter.chapter_number, verse });
    }
  }

  console.log(`  fetching ${targets.length} verses (concurrency 8)…`);
  let done = 0;
  let failed = 0;

  const rows = await mapWithConcurrency(targets, 8, async ({ chapter, verse }) => {
    let attempt = 0;
    while (attempt < 3) {
      try {
        const data = await fetchGitaVerse(chapter, verse);
        done += 1;
        if (done % 100 === 0) console.log(`    ${done}/${targets.length}`);
        if (!data) return null;

        const chapterMeta = chapters.find((item) => item.chapter_number === chapter);
        const row: LedgerRow = {
          topic_key: `gita:${chapter}.${verse}`,
          source: "gita",
          scripture: "Bhagavad Gita",
          reference: `Chapter ${chapter}, Verse ${verse}`,
          title: `Gita ${chapter}.${verse} — ${chapterMeta?.translation ?? "Bhagavad Gita"}`,
          theme: CHAPTER_THEMES[chapter] ?? "spiritual wisdom",
          summary:
            `From ${chapterMeta?.transliteration ?? `Chapter ${chapter}`} ` +
            `(${chapterMeta?.meaning?.en ?? "Bhagavad Gita"}). ` +
            `Krishna speaks this verse to Arjuna on the battlefield of Kurukshetra. ` +
            `Translation: ${data.translation}`,
          sanskrit: data.sanskrit || null,
          translation: data.translation,
          translator: data.translator,
          citation_url: data.citationUrl,
          weight: weightFor(chapter, verse),
        };
        return row;
      } catch {
        attempt += 1;
        if (attempt >= 3) {
          failed += 1;
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    return null;
  });

  if (failed > 0) console.log(`  ${failed} verses could not be fetched and were skipped.`);
  return rows.filter((row): row is LedgerRow => row !== null);
}

function buildCorpusRows(): LedgerRow[] {
  assertUniqueKeys();
  return CORPUS.map((entry) => ({
    topic_key: entry.key,
    source: entry.source,
    scripture: entry.scripture,
    reference: entry.reference,
    title: entry.title,
    theme: entry.theme,
    summary: entry.summary,
    sanskrit: null,
    translation: null,
    translator: null,
    citation_url: entry.citationUrl,
    weight: entry.weight ?? 100,
  }));
}

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : process.env[name.toUpperCase().replace(/-/g, "_")];
}

function bool(name: string, fallback: boolean): boolean {
  const raw = flag(name);
  if (raw === undefined || raw === "") return fallback;
  return raw !== "false" && raw !== "0" && raw !== "no";
}

/**
 * Every canto of every Purana that has an open translation.
 *
 * This is the part that used to be a hand-written array. Reading the books
 * themselves gives roughly two and a half thousand chapters instead of the two
 * hundred a person can reasonably type, and each one carries a deep citation to
 * the exact chapter plus the translated text the writer works from.
 *
 * Six of the eighteen have no open full text and are skipped here; the curated
 * entries cover those.
 *
 * Requests are made one at a time, on purpose. This is a one-off seed against
 * somebody else's server, and finishing twenty minutes sooner is not worth
 * being rate-limited halfway through.
 */
async function buildChapterRows(
  only: string[] | null,
  perPurana: number,
): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];

  for (const purana of MAHA_PURANAS) {
    if (only && !only.includes(purana.key)) continue;

    let links;
    try {
      links = await fetchChapterIndex(citationUrlFor(purana));
    } catch (error) {
      console.log(`  ${purana.name}: index unreachable (${(error as Error).message})`);
      continue;
    }

    if (links.length === 0) {
      console.log(`  ${purana.name}: no open full text here, curated entries cover it.`);
      continue;
    }

    const wanted = links.slice(0, perPurana);
    let kept = 0;
    let skipped = 0;

    for (const link of wanted) {
      try {
        const chapter = await fetchChapter(link.url);
        if (!isUsableChapter(chapter.text)) {
          skipped += 1;
          continue;
        }
        rows.push(buildChapterRow(purana, link, chapter));
        kept += 1;
      } catch {
        skipped += 1;
      }
    }

    const note = skipped > 0 ? ` (${skipped} skipped)` : "";
    console.log(`  ${purana.name}: ${kept} of ${links.length} chapters${note}`);
  }

  return rows;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Copy .env.example to .env.local and fill them in first.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  // Each stage can be run on its own. That is not a convenience: the Gita
  // stage depends on an external API, the chapter stage on a different site,
  // and bundling all three means one unreachable host loses the other two.
  const wantGita = bool("gita", true);
  const wantCurated = bool("curated", true);
  const wantChapters = bool("chapters", false);

  console.log(
    `Seeding topic ledger (gita=${wantGita} curated=${wantCurated} chapters=${wantChapters})\n`,
  );

  let gitaRows: LedgerRow[] = [];
  if (wantGita) {
    console.log("→ Bhagavad Gita");
    const chapters = await fetchGitaChapters();
    console.log(`  ${chapters.length} chapters found.`);
    gitaRows = await buildGitaRows(chapters);
    console.log(`  ${gitaRows.length} verses ready.\n`);
  }

  let corpusRows: LedgerRow[] = [];
  if (wantCurated) {
    console.log("→ Puranas, Upanishads and Ramayana");
    corpusRows = buildCorpusRows();
    console.log(`  ${corpusRows.length} curated topics ready.\n`);
  }

  // Off by default: it makes a couple of thousand requests to wisdomlib, which
  // is not something a routine re-seed should do without being asked.
  let chapterRows: LedgerRow[] = [];
  if (wantChapters) {
    // An empty value means "all of them", not "none of them". Passed through a
    // workflow input, blank is exactly what arrives, and an empty allow-list
    // would silently skip every Purana while reporting success.
    const keys = (flag("puranas") ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    const only = keys.length > 0 ? keys : null;

    const requested = Number(flag("per-purana"));
    const perPurana = Number.isFinite(requested) && requested > 0 ? requested : 500;

    console.log("→ Purana chapters, read from the published translations");
    if (only) console.log(`  limited to: ${only.join(", ")}`);
    chapterRows = await buildChapterRows(only, perPurana);
    console.log(`  ${chapterRows.length} chapters ready.\n`);
  }

  const all = [...gitaRows, ...corpusRows, ...chapterRows];

  if (all.length === 0) {
    console.log("Nothing selected to seed. Pass --gita, --curated or --chapters.");
    return;
  }

  console.log(`→ Writing ${all.length} topics to Supabase…`);
  let inserted = 0;

  for (let index = 0; index < all.length; index += 100) {
    const batch = all.slice(index, index + 100);
    const { error } = await supabase
      .from("topic_ledger")
      // ignoreDuplicates keeps already-used topics untouched on a re-run.
      .upsert(batch, { onConflict: "topic_key", ignoreDuplicates: true });

    if (error) {
      // Supabase puts the useful part in code/details/hint, not in message. A
      // bare "404 Not Found" cost a run to diagnose because the rest was
      // dropped on the floor.
      console.error(`  batch at ${index} failed.`);
      console.error(`    message: ${error.message}`);
      if (error.code) console.error(`    code:    ${error.code}`);
      if (error.details) console.error(`    details: ${error.details}`);
      if (error.hint) console.error(`    hint:    ${error.hint}`);
      console.error(`    project: ${new URL(url).host}`);
      console.error(`    columns: ${Object.keys(batch[0] ?? {}).join(", ")}`);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  ${inserted}/${all.length}`);
  }

  const { count: total } = await supabase
    .from("topic_ledger")
    .select("*", { count: "exact", head: true });
  const { count: unused } = await supabase
    .from("topic_ledger")
    .select("*", { count: "exact", head: true })
    .eq("times_used", 0);

  console.log(
    `\nDone. ${total ?? 0} topics in the ledger, ${unused ?? 0} never used.\n` +
      `At one video per day that is about ${Math.floor((unused ?? 0) / 365)} year(s) ` +
      `and ${(unused ?? 0) % 365} day(s) of content with zero repeats.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
