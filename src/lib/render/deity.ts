/**
 * Which god is on screen.
 *
 * The renderer used to pick a background at random out of one flat folder, and
 * that folder is empty, so every video ever made has been an abstract animated
 * gradient with captions over it. A retelling of Shiva swallowing the poison
 * looked exactly like a retelling of Krishna teaching Uddhava, because neither
 * one showed anything at all.
 *
 * The visual has to match the episode. So the model now names the deity the
 * episode centres on, and the renderer looks for backgrounds filed under that
 * name. Two sources, in this order, because each fails differently:
 *
 *  1. What the model said. It has read the passage and knows that a Shiva
 *     Purana episode can centre on Sati, on Ganesha, or on Markandeya rather
 *     than on Shiva himself.
 *  2. The scripture name, as a floor. If the model returns something
 *     unusable — a blank, a sentence, a transliteration nobody filed art
 *     under — the Purana it came from still narrows it to one god, because
 *     that is what the eighteen Maha Puranas are organised by.
 *
 * Kept pure so the mapping can be tested without a renderer, a model or a
 * filesystem.
 */

/**
 * Folder names the engine files backgrounds under.
 *
 * Deliberately a closed list. The alternative — trusting whatever the model
 * returns as a directory name — means a typo or a flourish ("Lord Shiva",
 * "Śiva", "shiva/../../etc") silently becomes a folder nobody filled, and the
 * video quietly falls back to the gradient with nothing to say why.
 */
export const DEITY_FOLDERS = [
  "shiva",
  "vishnu",
  "krishna",
  "rama",
  "devi",
  "ganesha",
  "hanuman",
  "brahma",
  "surya",
  "narasimha",
  "kartikeya",
  "yama",
  "indra",
  "sage",
  "general",
] as const;

export type DeityFolder = (typeof DEITY_FOLDERS)[number];

/**
 * Spellings and epithets that all mean the same folder.
 *
 * Written for what a model actually returns rather than for completeness: the
 * long-vowel transliterations, the "Lord X" forms, and the names an episode is
 * filed under when its famous character is a devotee rather than a god.
 */
const ALIASES: Record<string, DeityFolder> = {
  shiv: "shiva", siva: "shiva", shiva: "shiva", mahadev: "shiva", mahadeva: "shiva",
  rudra: "shiva", shankara: "shiva", nataraja: "shiva", bholenath: "shiva",

  vishnu: "vishnu", visnu: "vishnu", hari: "vishnu", narayana: "vishnu",
  venkateswara: "vishnu", balaji: "vishnu", vamana: "vishnu", kurma: "vishnu",
  varaha: "vishnu", matsya: "vishnu",

  krishna: "krishna", krsna: "krishna", govinda: "krishna", gopala: "krishna",
  vasudeva: "krishna", madhava: "krishna",

  rama: "rama", ram: "rama", raghava: "rama", sita: "rama", lakshmana: "rama",

  devi: "devi", parvati: "devi", sati: "devi", durga: "devi", kali: "devi",
  lakshmi: "devi", saraswati: "devi", shakti: "devi", uma: "devi", gauri: "devi",

  ganesha: "ganesha", ganesh: "ganesha", ganapati: "ganesha", vinayaka: "ganesha",

  hanuman: "hanuman", anjaneya: "hanuman", maruti: "hanuman",

  brahma: "brahma",
  surya: "surya", ravi: "surya",
  narasimha: "narasimha", nrsimha: "narasimha", prahlada: "narasimha",
  kartikeya: "kartikeya", murugan: "kartikeya", skanda: "kartikeya",
  subrahmanya: "kartikeya", kumara: "kartikeya",

  yama: "yama", markandeya: "yama",
  indra: "indra",

  // Episodes carried by a rishi rather than a god. Filed together because the
  // imagery is the same: an ascetic, a forest, a fire.
  narada: "sage", vyasa: "sage", agastya: "sage", vasistha: "sage",
  vishvamitra: "sage", bhrigu: "sage", durvasa: "sage", kashyapa: "sage",
  dadhichi: "sage", sage: "sage", rishi: "sage",
};

/**
 * The god a Purana is organised around, when the model gives us nothing usable.
 *
 * Order is significant, and the first two entries are why. The *Devi*
 * Bhagavata is a Devi text, not a Vishnu one, so the narrower name has to be
 * tested before the broader "bhagavata" that also appears in it. Anything
 * added here goes above the rule it would otherwise be swallowed by.
 */
const SCRIPTURE_DEITY: Array<[RegExp, DeityFolder]> = [
  [/devi|markandeya|brahmanda/i, "devi"],
  [/shiva|linga|skanda|vayu|kurma/i, "shiva"],
  [/bhagavata|vishnu|narada|garuda|padma|varaha|vamana|matsya/i, "vishnu"],
  [/ganesha/i, "ganesha"],
  [/brahma|bhavishya/i, "brahma"],
  [/ramayana/i, "rama"],
  [/gita|mahabharata/i, "krishna"],
  [/agni|narasimha/i, "narasimha"],
];

/** Strip to bare lowercase letters: "Lord Śiva!" -> "siva". */
function bare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\blord\b|\bshri\b|\bsri\b|\bbhagavan\b/g, "")
    .replace(/[^a-z]/g, "");
}

/**
 * The folder to look for backgrounds in. Never null, never a path fragment —
 * "general" is the honest answer when nothing else matches.
 */
export function deityFolder(
  modelAnswer: string | null | undefined,
  scripture: string | null | undefined,
): DeityFolder {
  const named = bare(modelAnswer ?? "");
  if (named && named in ALIASES) return ALIASES[named];

  // The model sometimes answers with a phrase rather than a name. Take the
  // first word in it that is a name we file under.
  for (const word of (modelAnswer ?? "").split(/[^A-Za-z]+/)) {
    const key = bare(word);
    if (key && key in ALIASES) return ALIASES[key];
  }

  for (const [pattern, folder] of SCRIPTURE_DEITY) {
    if (pattern.test(scripture ?? "")) return folder;
  }

  return "general";
}
