/**
 * The Puranas, read from the translations this engine already cites.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Purana corpus used to be a hand-written array. That was fine for a
 * demonstration and wrong for a channel: a person typing entries is a hard
 * ceiling, and the ceiling was 217 days. The Gita was never hardcoded — 700
 * verses are fetched from a live API at seed time — and the Puranas were simply
 * the exception that never got the same treatment.
 *
 * wisdomlib hosts the public-domain translations that every citation in this
 * repository already pointed at, and its book pages list each canto with its
 * own URL. Reading that index turns roughly two and a half thousand chapters
 * into topics, each with a real reference, a deep citation to the exact
 * chapter, and the translated text itself.
 *
 * That last part matters most. The engine's founding rule is that the model is
 * never asked to *recall* scripture; it is handed the passage. A hand-written
 * summary was a paraphrase standing in for the source. The chapter text is the
 * source.
 *
 * Six of the eighteen — Matsya, Kurma, Varaha, Vamana, Bhavishya and
 * Brahmavaivarta — have no open full text here. The curated entries in
 * puranas.ts remain for those, and as a high-weight layer everywhere else so
 * the famous episodes still lead.
 */

const ORIGIN = "https://www.wisdomlib.org";

/** Politeness, and self-preservation: a burst of requests gets throttled. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Chapter bodies run to thousands of words. The prompt only needs enough to
 * write sixty seconds from, and a whole canto would crowd out everything else
 * in the context window.
 */
export const MAX_TEXT_CHARS = 6_000;

export interface ChapterLink {
  url: string;
  label: string;
}

export interface FetchedChapter {
  text: string;
  translator: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Everything a printed book has that is not the book.
 *
 * Matched against the whole label rather than as a substring: "Invocation" is
 * front matter, while "Canto III - The Invocation of Durga" is a chapter, and a
 * substring match would throw the second away with the first.
 */
const FRONT_MATTER =
  /^(title page|preface|foreword|introduction|contents?|table of contents|index(\s+of\s+content.*)?|list of contents?|appendix\b.*|errata|additions and corrections|bibliography|abbreviations|invocation|dedication|colophon|notes?|glossary|about.*|copyright.*)$/i;

export function isFrontMatter(label: string): boolean {
  return FRONT_MATTER.test(label.trim());
}

/**
 * "Canto V - Indra's Transformations" becomes a reference and a title.
 *
 * The reference is what a reader opens the book at, so it is kept separate from
 * the chapter's name rather than stored as one string. Labels without a
 * separator keep the whole label as both.
 */
export function splitReference(label: string): { reference: string; title: string } {
  const trimmed = label.trim();
  const match = /^(.{1,40}?)\s+[-–—]\s+(.+)$/.exec(trimmed);
  if (!match) return { reference: trimmed, title: trimmed };
  return { reference: match[1].trim(), title: match[2].trim() };
}

/**
 * Every chapter of one book, in the order the book lists them.
 *
 * `bookPath` scopes the match: a wisdomlib page links to many other books in
 * its sidebar, and without the filter their chapters end up attributed to the
 * wrong Purana.
 */
export function parseChapterIndex(html: string, bookPath: string): ChapterLink[] {
  const pattern = /<a[^>]+href="([^"]+\/d\/doc\d+\.html)"[^>]*>([^<]{2,150})<\/a>/g;
  const seen = new Set<string>();
  const links: ChapterLink[] = [];

  for (const match of html.matchAll(pattern)) {
    const href = match[1];
    if (!href.startsWith(bookPath)) continue;

    const label = decodeEntities(match[2]).replace(/\s+/g, " ").trim();
    if (!label) continue;
    // Both halves: some books number their front matter, so the contents page
    // arrives as "Chapter 2 - Index of Content" and passes a whole-label check.
    if (isFrontMatter(label) || isFrontMatter(splitReference(label).title)) continue;

    const url = href.startsWith("http") ? href : `${ORIGIN}${href}`;
    if (seen.has(url)) continue;
    seen.add(url);

    links.push({ url, label });
  }

  return links;
}

/** The translated body of one chapter, without the site's furniture. */
export function extractChapterText(html: string): string {
  const match = /<div[^>]*id="scontent"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<\/div>|$)/i.exec(html);
  const body = match?.[1] ?? "";
  return stripTags(body);
}

/** "by Frederick Eden Pargiter | 1904 | 247,181 words" → the name. */
export function extractTranslator(html: string): string | null {
  const match = /<p[^>]*>\s*by\s+([^<|]{3,80})\s*\|/i.exec(html);
  return match ? decodeEntities(match[1]).trim() : null;
}

async function get(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // wisdomlib serves a different page, or nothing, to an unidentified client.
        "user-agent":
          "Mozilla/5.0 (compatible; spiritual-content-engine/1.0; +https://github.com/yarlagaddasaikiran48-netizen/content_engine)",
        accept: "text/html",
      },
    });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchChapterIndex(bookUrl: string): Promise<ChapterLink[]> {
  const bookPath = new URL(bookUrl).pathname.replace(/\/$/, "");
  return parseChapterIndex(await get(bookUrl), bookPath);
}

export async function fetchChapter(url: string): Promise<FetchedChapter> {
  const html = await get(url);
  return {
    text: extractChapterText(html).slice(0, MAX_TEXT_CHARS),
    translator: extractTranslator(html),
  };
}
