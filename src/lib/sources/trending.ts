/**
 * Trending signal — Google Trends daily RSS for India (geo=IN).
 *
 * Free, no key, no quota. The feed is raw and noisy (cricket scores, phone
 * launches, film releases, and a lot of regional-language terms), so we do NOT
 * hand it to the model wholesale. A term is passed through only if it clearly
 * belongs to the devotional/festival space, and a hard blocklist keeps
 * politics, crime, communal topics and celebrity gossip out entirely.
 *
 * The rule: a trend may shape the *framing* of a script. It can never replace
 * the scripture topic, which always comes from the verified ledger.
 */

const TRENDS_RSS = "https://trends.google.com/trending/rss?geo=IN";

/**
 * Terms that make a trend usable. Deliberately devotional/cultural — matching
 * happens on lowercase substrings, so "ganesh" catches "Ganesh Chaturthi".
 */
const RELEVANT = [
  // festivals & observances
  "diwali", "deepavali", "holi", "navratri", "navaratri", "dussehra", "dasara",
  "vijayadashami", "janmashtami", "krishna jayanti", "ganesh", "ganpati",
  "shivratri", "shivaratri", "mahashivratri", "ekadashi", "purnima", "amavasya",
  "pongal", "sankranti", "makar", "ugadi", "gudi padwa", "baisakhi", "vaisakhi",
  "onam", "rakhi", "raksha bandhan", "karva chauth", "karwa chauth", "chhath",
  "durga puja", "saraswati puja", "vasant panchami", "ram navami", "hanuman jayanti",
  "guru purnima", "akshaya tritiya", "bhai dooj", "govardhan", "dhanteras",
  "kumbh", "mahakumbh", "ardh kumbh", "shravan", "sawan", "chaturmas", "pitru paksha",
  "gita jayanti", "buddha purnima", "mahavir jayanti", "nag panchami",
  // deities & scripture
  "krishna", "rama", "shri ram", "shiva", "mahadev", "vishnu", "ganesha",
  "hanuman", "durga", "lakshmi", "saraswati", "kali", "parvati", "brahma",
  "narasimha", "venkateswara", "balaji", "jagannath", "murugan", "ayyappa",
  "gita", "bhagavad", "ramayan", "mahabharat", "purana", "veda", "upanishad",
  "bhajan", "aarti", "mantra", "shloka", "chalisa", "sundarkand",
  // places & practice
  "temple", "mandir", "tirupati", "vaishno devi", "kedarnath", "badrinath",
  "kashi", "varanasi", "ayodhya", "somnath", "shirdi", "puri", "rameshwaram",
  "amarnath", "yatra", "darshan", "puja", "pooja", "vrat", "fasting", "havan",
  "meditation", "dhyana", "yoga", "spiritual", "devotional", "bhakti", "karma",
  "dharma", "moksha", "satsang", "kirtan",
] as const;

/**
 * Hard blocklist. If a trend touches any of these it is dropped, even when it
 * also matches a relevant term — religion crossed with politics or crime is
 * exactly the content this channel must never make.
 */
const BLOCKED = [
  "election", "vote", "bjp", "congress", "aap ", "party", "minister", "mp ",
  "mla", "protest", "riot", "violence", "attack", "blast", "bomb", "terror",
  "murder", "rape", "assault", "arrest", "police", "court", "verdict", "case",
  "scam", "fraud", "controversy", "row", "slam", "insult", "outrage", "boycott",
  "dispute", "clash", "communal", "conversion", "love jihad", "mosque", "church",
  "hindu-muslim", "caste", "reservation", "war", "strike", "death", "died",
  "dies", "accident", "crash", "suicide", "hospital", "cancer", "divorce",
  "affair", "girlfriend", "boyfriend", "dating", "leaked", "viral video",
  "box office", "movie review", "trailer", "web series", "actress", "actor",
  "cricket", "ipl", "match", "score", "wicket", "stock", "share price",
  "sensex", "nifty", "crypto", "bitcoin", "lottery", "betting", "result",
] as const;

export interface TrendResult {
  /** Trends judged safe and spiritually relevant. Often empty — that's fine. */
  relevant: string[];
  /** How many items the feed returned, for logging. */
  totalSeen: number;
  /** Populated when the feed was unreachable; generation continues regardless. */
  error?: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Pull <title> values from <item> blocks, skipping the channel title. */
function parseTitles(xml: string): string[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  const titles: string[] = [];
  for (const item of items) {
    const match = item.match(/<title>([\s\S]*?)<\/title>/);
    if (match) {
      const title = decodeEntities(match[1]);
      if (title) titles.push(title);
    }
  }
  return titles;
}

export function isRelevantTrend(term: string): boolean {
  const lower = ` ${term.toLowerCase()} `;
  if (BLOCKED.some((bad) => lower.includes(bad))) return false;
  return RELEVANT.some((good) => lower.includes(good));
}

/**
 * Fetch and filter today's Indian trends.
 *
 * Never throws: a dead feed must not stop the day's video from being made.
 */
export async function fetchRelevantTrends(limit = 5): Promise<TrendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(TRENDS_RSS, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { relevant: [], totalSeen: 0, error: `HTTP ${response.status}` };
    }

    const titles = parseTitles(await response.text());
    const relevant: string[] = [];
    const seen = new Set<string>();

    for (const title of titles) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (isRelevantTrend(title)) relevant.push(title);
      if (relevant.length >= limit) break;
    }

    return { relevant, totalSeen: titles.length };
  } catch (error) {
    return {
      relevant: [],
      totalSeen: 0,
      error: error instanceof Error ? error.message : "unknown error",
    };
  } finally {
    clearTimeout(timer);
  }
}
