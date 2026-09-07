/**
 * The eighteen Maha Puranas.
 *
 * This is the canonical sequence the engine rotates through — one Purana per
 * day, in the traditional enumeration order. Nothing about the rotation is
 * hardcoded at the call site: the date decides the index, the index decides
 * the Purana, and the Purana decides which topics are eligible. Change the
 * epoch or the cadence in env and the whole schedule shifts with it.
 *
 * The traditional mnemonic for the order is:
 *   two beginning "ma"   — Matsya, Markandeya
 *   two beginning "bha"  — Bhagavata, Bhavishya
 *   three beginning "bra"— Brahma, Brahmanda, Brahmavaivarta
 *   four beginning "va"  — Vamana, Vayu, Varaha, Vishnu
 *   then a-na-pa-lin-ga-ku-ska — Agni, Narada, Padma, Linga, Garuda, Kurma, Skanda
 *
 * `verses` are the traditional counts given in the Puranas' own lists (the
 * Matsya Purana enumerates them), totalling ~400,000. Surviving manuscripts
 * vary, so treat them as tradition rather than a manuscript census.
 *
 * `fullTextUrl` is a complete English translation, verified to resolve.
 * Thirteen of the eighteen have one; the rest fall back to `referenceUrl`.
 * `citationUrlFor()` resolves that preference so no caller has to know.
 */

/** Padma Purana's three-fold classification by guna. */
export type PuranaCategory = "sattva" | "rajas" | "tamas";

export interface MahaPurana {
  /** 1-18, the traditional enumeration order. */
  order: number;
  /** Stable machine key, used to build topic keys. */
  key: string;
  /** Display name. */
  name: string;
  /** Sanskrit/Devanagari name. */
  sanskritName: string;
  category: PuranaCategory;
  /** The deity the text primarily elevates. */
  presidingDeity: string;
  /** Traditional verse count. */
  verses: number;
  /** One line on what the text is actually preoccupied with. */
  character: string;
  /** Themes this Purana is the natural home for. */
  themes: string[];
  /** Full English translation, or null when none is hosted openly. */
  fullTextUrl: string | null;
  /** Always resolves; used when there is no open full text. */
  referenceUrl: string;
}

const WISDOMLIB = "https://www.wisdomlib.org/hinduism/book/";
const WIKI = "https://en.wikipedia.org/wiki/";

export const MAHA_PURANAS: MahaPurana[] = [
  {
    order: 1,
    key: "brahma",
    name: "Brahma Purana",
    sanskritName: "ब्रह्म पुराण",
    category: "rajas",
    presidingDeity: "Brahma",
    verses: 10_000,
    character:
      "Often called the 'first' Purana. Large sections are a guide to the sacred places of Odisha — Konark's sun temple and the Jagannath shrine at Puri.",
    themes: ["sacred geography", "sun worship", "pilgrimage", "creation"],
    fullTextUrl: `${WISDOMLIB}the-brahma-purana`,
    referenceUrl: `${WIKI}Brahma_Purana`,
  },
  {
    order: 2,
    key: "padma",
    name: "Padma Purana",
    sanskritName: "पद्म पुराण",
    category: "sattva",
    presidingDeity: "Vishnu",
    verses: 55_000,
    character:
      "Named for the lotus from which Brahma emerged. Contains the Bhagavata Mahatmya, the allegory of Bhakti as a young woman with two aged sons, Jnana and Vairagya.",
    themes: ["devotion", "tulsi", "vows", "the glory of the name"],
    fullTextUrl: `${WISDOMLIB}the-padma-purana`,
    referenceUrl: `${WIKI}Padma_Purana`,
  },
  {
    order: 3,
    key: "vishnu",
    name: "Vishnu Purana",
    sanskritName: "विष्णु पुराण",
    category: "sattva",
    presidingDeity: "Vishnu",
    verses: 23_000,
    character:
      "The most tightly structured of them all, and the closest to the textbook definition of a Purana. Home of Dhruva, Prahlada and the young Krishna.",
    themes: ["perseverance", "devotion under persecution", "dharma", "the Kali age"],
    fullTextUrl: `${WISDOMLIB}vishnu-purana-wilson`,
    referenceUrl: `${WIKI}Vishnu_Purana`,
  },
  {
    order: 4,
    key: "shiva",
    name: "Shiva Purana",
    sanskritName: "शिव पुराण",
    category: "tamas",
    presidingDeity: "Shiva",
    verses: 24_000,
    character:
      "The great Shaiva compendium — Sati and Daksha, the birth of Ganesha, the twelve jyotirlingas, and the pillar of light neither Brahma nor Vishnu could measure.",
    themes: ["renunciation", "the formless", "devotion", "fearlessness before death"],
    fullTextUrl: `${WISDOMLIB}shiva-purana-english`,
    referenceUrl: `${WIKI}Shiva_Purana`,
  },
  {
    order: 5,
    key: "bhagavata",
    name: "Bhagavata Purana",
    sanskritName: "भागवत पुराण",
    category: "sattva",
    presidingDeity: "Krishna",
    verses: 18_000,
    character:
      "The most loved and most quoted. Twelve cantos culminating in Krishna's life, and the source of Gajendra, Ajamila, Prahlada and the avadhuta's twenty-four teachers.",
    themes: ["surrender", "the divine name", "devotion", "letting go"],
    fullTextUrl: `${WISDOMLIB}the-bhagavata-purana`,
    referenceUrl: `${WIKI}Bhagavata_Purana`,
  },
  {
    order: 6,
    key: "narada",
    name: "Narada Purana",
    sanskritName: "नारद पुराण",
    category: "sattva",
    presidingDeity: "Vishnu",
    verses: 25_000,
    character:
      "Spoken by the wandering sage who never stops singing the name. Heavy on vows, sacred days and the mechanics of devotional practice.",
    themes: ["constant remembrance", "vows", "holy company", "ekadashi"],
    fullTextUrl: `${WISDOMLIB}the-narada-purana`,
    referenceUrl: `${WIKI}Narada_Purana`,
  },
  {
    order: 7,
    key: "markandeya",
    name: "Markandeya Purana",
    sanskritName: "मार्कण्डेय पुराण",
    category: "rajas",
    presidingDeity: "Devi / Surya",
    verses: 9_000,
    character:
      "Contains the Devi Mahatmya — the Durga Saptashati — recited every Navratri, plus the story of Harishchandra, who would not tell one lie.",
    themes: ["the divine feminine", "courage", "truthfulness", "power"],
    fullTextUrl: `${WISDOMLIB}the-markandeya-purana`,
    referenceUrl: `${WIKI}Markandeya_Purana`,
  },
  {
    order: 8,
    key: "agni",
    name: "Agni Purana",
    sanskritName: "अग्नि पुराण",
    category: "tamas",
    presidingDeity: "Agni / Vishnu",
    verses: 15_400,
    character:
      "An encyclopedia rather than a narrative: architecture, medicine, grammar, statecraft, archery and law, all sitting beside devotion.",
    themes: ["practical wisdom", "discipline", "knowledge", "duty"],
    fullTextUrl: `${WISDOMLIB}the-agni-purana`,
    referenceUrl: `${WIKI}Agni_Purana`,
  },
  {
    order: 9,
    key: "bhavishya",
    name: "Bhavishya Purana",
    sanskritName: "भविष्य पुराण",
    category: "rajas",
    presidingDeity: "Surya",
    verses: 14_500,
    character:
      "Its name means 'the future', and it is framed as prophecy. Strong on sun worship, festivals, and the duties that structure a household year.",
    themes: ["time", "the sun", "festivals", "consequences of action"],
    fullTextUrl: null,
    referenceUrl: `${WIKI}Bhavishya_Purana`,
  },
  {
    order: 10,
    key: "brahmavaivarta",
    name: "Brahmavaivarta Purana",
    sanskritName: "ब्रह्मवैवर्त पुराण",
    category: "rajas",
    presidingDeity: "Krishna / Radha",
    verses: 18_000,
    character:
      "Four books on Brahma, Prakriti, Ganesha and Krishna. It elevates Radha as inseparable from Krishna and the goddess as the ground of nature itself.",
    themes: ["divine love", "the feminine principle", "obstacles removed", "creation"],
    fullTextUrl: null,
    referenceUrl: `${WIKI}Brahmavaivarta_Purana`,
  },
  {
    order: 11,
    key: "linga",
    name: "Linga Purana",
    sanskritName: "लिङ्ग पुराण",
    category: "tamas",
    presidingDeity: "Shiva",
    verses: 11_000,
    character:
      "Explains the linga as a deliberately unshaped 'mark' for what has no shape — a form given so the mind has somewhere to rest.",
    themes: ["the formless", "symbol and reality", "patience", "worship"],
    fullTextUrl: `${WISDOMLIB}the-linga-purana`,
    referenceUrl: `${WIKI}Linga_Purana`,
  },
  {
    order: 12,
    key: "varaha",
    name: "Varaha Purana",
    sanskritName: "वराह पुराण",
    category: "sattva",
    presidingDeity: "Vishnu (as Varaha)",
    verses: 24_000,
    character:
      "Told by Vishnu in his boar form to the earth goddess he has just lifted out of the cosmic ocean — a text framed as a rescue in progress.",
    themes: ["rescue", "bearing weight", "the earth", "restoration"],
    fullTextUrl: null,
    referenceUrl: `${WIKI}Varaha_Purana`,
  },
  {
    order: 13,
    key: "skanda",
    name: "Skanda Purana",
    sanskritName: "स्कन्द पुराण",
    category: "tamas",
    presidingDeity: "Kartikeya (Skanda)",
    verses: 81_100,
    character:
      "By far the largest Purana. Vast sections are mahatmyas of particular places — above all Kashi, described as resting on Shiva's trident, untouched by dissolution.",
    themes: ["sacred places", "courage", "pilgrimage", "liberation"],
    fullTextUrl: `${WISDOMLIB}the-skanda-purana`,
    referenceUrl: `${WIKI}Skanda_Purana`,
  },
  {
    order: 14,
    key: "vamana",
    name: "Vamana Purana",
    sanskritName: "वामन पुराण",
    category: "rajas",
    presidingDeity: "Vishnu (as Vamana)",
    verses: 10_000,
    character:
      "Named for the dwarf who asked King Bali for three paces of land. A short Purana preoccupied with humility outmatching power.",
    themes: ["humility", "keeping your word", "generosity", "pride"],
    fullTextUrl: null,
    referenceUrl: `${WIKI}Vamana_Purana`,
  },
  {
    order: 15,
    key: "kurma",
    name: "Kurma Purana",
    sanskritName: "कूर्म पुराण",
    category: "tamas",
    presidingDeity: "Vishnu (as Kurma) / Shiva",
    verses: 17_000,
    character:
      "Spoken by the tortoise who held up Mount Mandara during the churning of the ocean. Contains the Ishvara Gita, a Shaiva counterpart to the Bhagavad Gita.",
    themes: ["bearing the load", "steadiness", "endurance", "knowledge"],
    fullTextUrl: null,
    referenceUrl: `${WIKI}Kurma_Purana`,
  },
  {
    order: 16,
    key: "matsya",
    name: "Matsya Purana",
    sanskritName: "मत्स्य पुराण",
    category: "tamas",
    presidingDeity: "Vishnu (as Matsya)",
    verses: 14_000,
    character:
      "Framed as the fish's instruction to Manu as the flood rises. It is also the text that enumerates the eighteen Puranas themselves.",
    themes: ["warning heeded", "preservation", "renewal", "trust"],
    fullTextUrl: null,
    referenceUrl: `${WIKI}Matsya_Purana`,
  },
  {
    order: 17,
    key: "garuda",
    name: "Garuda Purana",
    sanskritName: "गरुड पुराण",
    category: "sattva",
    presidingDeity: "Vishnu",
    verses: 19_000,
    character:
      "Vishnu answering Garuda's questions. Known for its Preta Khanda on death and what follows — traditionally recited to the living, in the one moment they truly listen.",
    themes: ["mortality", "accountability", "charity", "right living"],
    fullTextUrl: `${WISDOMLIB}the-garuda-purana`,
    referenceUrl: `${WIKI}Garuda_Purana`,
  },
  {
    order: 18,
    key: "brahmanda",
    name: "Brahmanda Purana",
    sanskritName: "ब्रह्माण्ड पुराण",
    category: "rajas",
    presidingDeity: "Brahma / Lalita",
    verses: 12_000,
    character:
      "Named for the cosmic egg. Preserves the Lalita Sahasranama, whose thousand names insist that supreme power and supreme tenderness are the same thing.",
    themes: ["cosmology", "the goddess", "beauty and power", "vastness"],
    fullTextUrl: `${WISDOMLIB}the-brahmanda-purana`,
    referenceUrl: `${WIKI}Brahmanda_Purana`,
  },
];

/** Lookup by machine key. */
export const PURANA_BY_KEY: ReadonlyMap<string, MahaPurana> = new Map(
  MAHA_PURANAS.map((purana) => [purana.key, purana]),
);

/** Lookup by display name, which is how the ledger stores `scripture`. */
export const PURANA_BY_NAME: ReadonlyMap<string, MahaPurana> = new Map(
  MAHA_PURANAS.map((purana) => [purana.name, purana]),
);

/** Best available citation: open full text when one exists, else the reference. */
export function citationUrlFor(purana: MahaPurana): string {
  return purana.fullTextUrl ?? purana.referenceUrl;
}

/** Whole days elapsed between two dates, UTC. */
function daysBetween(from: Date, to: Date): number {
  const day = 86_400_000;
  return Math.floor(
    (Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) -
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) /
      day,
  );
}

export interface RotationOptions {
  /** Day zero of the cycle. Defaults to the Unix epoch. */
  epoch?: Date;
  /** Days spent on each Purana before advancing. Defaults to 1. */
  daysPerPurana?: number;
}

/**
 * Which Purana today belongs to.
 *
 * Pure and deterministic: the same date always yields the same Purana, on any
 * machine, with no stored cursor to drift out of sync.
 */
export function puranaForDate(
  date: Date = new Date(),
  options: RotationOptions = {},
): MahaPurana {
  const epoch = options.epoch ?? new Date(Date.UTC(1970, 0, 1));
  const stride = Math.max(1, Math.floor(options.daysPerPurana ?? 1));
  const elapsed = Math.floor(daysBetween(epoch, date) / stride);
  const index = ((elapsed % MAHA_PURANAS.length) + MAHA_PURANAS.length) % MAHA_PURANAS.length;
  return MAHA_PURANAS[index];
}

/**
 * The rotation starting at today and wrapping all the way round.
 *
 * The pipeline walks this list: if today's Purana has no unused topics left,
 * it moves to the next rather than giving up, so the cycle degrades to
 * "nearest available Purana" instead of failing.
 */
export function rotationFrom(
  date: Date = new Date(),
  options: RotationOptions = {},
): MahaPurana[] {
  const today = puranaForDate(date, options);
  const start = today.order - 1;
  return Array.from(
    { length: MAHA_PURANAS.length },
    (_, offset) => MAHA_PURANAS[(start + offset) % MAHA_PURANAS.length],
  );
}
