/**
 * Language safety filter.
 *
 * Devotional content has zero tolerance for coarse language, and a single
 * slip would be permanently attached to the channel. Gemini's own safety
 * settings are the first line of defence; this module is the second, and it
 * runs on the finished text before anything is stored or spoken.
 *
 * Three checks:
 *   1. Profanity — word-boundary matched, with leetspeak normalised so
 *      "sh1t" and "f_uck" cannot slip through.
 *   2. Forbidden topics — politics, communal comparison, caste, crime, and
 *      anything that would make a spiritual channel toxic.
 *   3. Harmful claims — miracle cures, guaranteed wealth, and instructions to
 *      abandon medicine or family, which are the classic failure modes of
 *      auto-generated "spiritual" content.
 */

/** Coarse language. Matched on word boundaries after normalisation. */
const PROFANITY = [
  "fuck", "fucking", "fucked", "shit", "bullshit", "bitch", "bastard",
  "asshole", "arsehole", "dick", "cunt", "slut", "whore", "prick", "wanker",
  "damn", "goddamn", "crap", "piss", "pissed", "dumbass", "jackass",
  "motherfucker", "bollocks", "bugger", "twat", "douchebag",
  // Common Hindi / Hinglish abuse, romanised
  "chutiya", "chutiye", "bhosdi", "bhosdike", "madarchod", "behenchod",
  "bhenchod", "gandu", "gaand", "randi", "harami", "kamina", "kutta sala",
  "saala", "haramzada", "lodu", "chodu",
  // Romanised Telugu abuse. Latin script, so the word-boundary match below
  // still applies to these.
  //
  // "munda" was here and was removed. It is coarse, but it is also the name of
  // a demon Kali kills in the Devi Mahatmya -- which sits inside the Markandeya
  // Purana, one of the eighteen in the daily rotation. "Kali destroyed the
  // demons Chanda and Munda, and became Chamunda" was unpublishable, and since
  // "Chamunda" alone passes the word-boundary check, the rejection looked
  // random rather than explicable.
  "lanja", "lanjakodaka", "modda", "pooku", "denga", "dengey",
  "yedava", "vedhava", "sachinodu", "gudda",
];

/**
 * Telugu-script abuse.
 *
 * Kept separate because the English list's word-boundary match does not work
 * here at all: JavaScript defines \b over [A-Za-z0-9_], so every Telugu
 * character is a non-word character and /\bలంజ\b/ is false even for an exact
 * standalone match. Reusing that pattern would produce a filter that matches
 * nothing while appearing to work.
 *
 * Matched from the head of a word instead, which is also the right shape for
 * an agglutinative language: the root keeps its spelling and grows a suffix,
 * so anchoring the head catches every inflection without the false positives a
 * bare substring search would bring.
 *
 * Deliberately short. Only unambiguous terms belong here — a word with an
 * innocent everyday meaning would reject good scripts, and every rejection
 * costs a topic and a model call.
 */
const TELUGU_PROFANITY = [
  "లంజ", "పూకు", "మొడ్డ", "దెంగ", "ఎదవ", "వెధవ", "సచ్చినోడు",
];

/** Slurs and demeaning terms — an automatic, unconditional rejection. */
const SLURS = [
  "retard", "retarded", "faggot", "nigger", "chink", "paki", "spastic",
  "tranny", "midget", "cripple",
];

/** Topics a devotional short must never touch. */
const FORBIDDEN_TOPICS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(bjp|congress|aap|modi|rahul gandhi|election|vote for|political party)\b/i, label: "party politics" },
  { pattern: /\b(hindu|hinduism)\s+(is\s+)?(better|superior|greater)\s+than\b/i, label: "religious superiority" },
  { pattern: /\b(muslim|christian|islam|christianity|sikh|buddhis[tm]|jain)\w*\s+(are|is)\s+(wrong|false|evil|inferior)\b/i, label: "attacking another faith" },
  { pattern: /\b(convert|conversion)\s+(to|from)\s+(hinduism|islam|christianity)\b/i, label: "religious conversion" },
  // Caste, but not the word "untouchable" used of a body. `\buntouchab`
  // matched "a boon that made the demon untouchable by any weapon", which is a
  // stock formula in these stories and has nothing to do with caste.
  { pattern: /\b(upper|lower|high|low)\s+caste\b|\bcaste\s+(system|superiority|purity)\b|\buntouchabilit|\buntouchable\s+(caste|community|people|class)\b/i, label: "caste" },

  // INCITEMENT, not narration.
  //
  // This used to read /\b(kill|murder|attack|destroy|burn)\s+(them|him|her|
  // those|the)\b/, and on a channel that retells the Puranas it was rejecting
  // the corpus. Measured against descriptions written exactly as the master
  // prompt orders them: "Yama came to kill him", "Vishnu took the Narasimha
  // form to destroy the king", "his soldiers to burn the boy" -- all thrown
  // away, each costing a whole generation, a spent topic and another Gemini
  // request, with the log saying only "unsafe".
  //
  // These stories are ABOUT gods killing demons. That is the content, and a
  // filter that cannot tell it from incitement cannot be used here. What must
  // never appear is violence aimed at the viewer or at real people, so that is
  // what this matches now: the second person, and named real-world groups.
  {
    pattern:
      /\byou\s+(should|must|need to|have to)\s+(kill|murder|attack|destroy|burn)\b|\b(kill|murder|attack|destroy|burn)\s+(your|yourself|yourselves)\b|\b(kill|murder|attack|destroy|burn)\s+(all\s+)?(the\s+)?(muslims|christians|hindus|sikhs|jews|buddhists|jains|kafirs|infidels)\b/i,
    label: "incitement to violence",
  },

  { pattern: /\b(suicide|kill yourself|end your life)\b/i, label: "self-harm" },

  // "naked" and "nude" alone rejected "Shiva sat naked in ash on the cremation
  // ground" -- digambara, an iconographic fact, not sexual content. They now
  // need an actually sexual object.
  { pattern: /\b(sex|sexual|erotic|porn|pornographic)\b|\b(nude|naked)\s+(woman|women|girl|girls|man|men|body|bodies|photo|photos|picture|pictures)\b/i, label: "sexual content" },

  // Bare "smoking" rejected "the smoking remains of Daksha's sacrifice", and
  // "weed" is also a plant. Both now need something being consumed.
  { pattern: /\b(alcohol|liquor|whisky|cocaine|heroin|marijuana|ganja)\b|\bdrugs\b|\bsmoking\s+(a\s+)?(cigarette|cigarettes|beedi|ganja|weed|joint)\b/i, label: "substances" },
];

/** Claims that are harmful, unprovable, or would get a channel demonetised. */
const HARMFUL_CLAIMS: Array<{ pattern: RegExp; label: string }> = [
  // The named diseases stay: no Purana episode claims to cure cancer, so there
  // is no false positive to have. Bare "disease" is gone -- "only Shiva's grace
  // could heal disease and death itself" is a line from a story, not a claim
  // made to the viewer. A claim aimed at the viewer is caught on the next line.
  { pattern: /\b(cure|cures|heal|heals|treatment)\s+(cancer|diabetes|aids|hiv|covid|tuberculosis)\b/i, label: "medical cure claim" },
  { pattern: /\b(this|these|the)\s+(mantra|chant|stotra|ritual|puja|remedy)\s+(will|can)\s+(cure|heal|remove)\s+(your|any|all)\b/i, label: "medical cure claim" },
  { pattern: /\b(stop|quit|avoid|don'?t take)\s+(your\s+)?(medicine|medication|treatment|doctor)\b/i, label: "discouraging medical care" },
  { pattern: /\b(guarantee|guaranteed|100%\s*sure|definitely will)\s+(make you|get you|bring you)?\s*(rich|wealthy|money|crore|lakh)\b/i, label: "guaranteed wealth claim" },
  { pattern: /\b(send|donate|pay|transfer)\s+(me|us)\s+(money|rs|rupees|₹|\$)/i, label: "solicitation" },
  // Aimed at the viewer, not narrated. "The sage's curse will destroy the line
  // of Yadu" is the Mausala Parva; threatening the person watching is not.
  { pattern: /\b(curse|black magic|vashikaran|tantrik)\s+(will|can)\s+(destroy|harm|kill)\s+(you|your)\b/i, label: "occult harm" },
  { pattern: /\bleave\s+your\s+(family|children|wife|husband|job)\b/i, label: "urging abandonment" },
];

/** Signs the model produced scaffolding instead of a script. */
const ARTEFACTS: RegExp[] = [
  /\[(insert|your|placeholder|todo|tbd)/i,
  /\bas an ai\b/i,
  /\bi'?m sorry,? (but )?i (can'?t|cannot)\b/i,
  /\blorem ipsum\b/i,
  /\{\{.*?\}\}/,
  /^\s*(script|title|body|description)\s*:\s*$/im,
];

/**
 * Fold leetspeak and separator-obfuscation so "f.u.c.k" and "sh1t" are caught.
 * Only used for detection — never for the text that gets published.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    // collapse characters used to break up words: f*u*c*k -> fuck
    .replace(/[._\-*+~^|]/g, "")
    .replace(/\s+/g, " ");
}

export interface SafetyIssue {
  category: "profanity" | "slur" | "forbidden_topic" | "harmful_claim" | "artefact";
  detail: string;
}

export interface SafetyReport {
  safe: boolean;
  issues: SafetyIssue[];
}

/** Escape a literal for safe insertion into a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Zero-width joiners are common in Telugu input and split a word invisibly, so
 * a term written with one would slip any literal match. Removing them is safe
 * for detection; published text is never taken from here.
 */
export function stripJoiners(text: string): string {
  return text.replace(/[​-‍﻿]/g, "");
}

/**
 * Does `term` appear at the head of a word in `text`?
 *
 * Suffixes may follow — that is how Telugu inflects — but another Telugu
 * letter may not precede, which stops a root matching inside an unrelated
 * longer word.
 */
export function containsTeluguTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^ఀ-౿])${escapeRegex(term)}`).test(text);
}

export function checkSafety(...texts: string[]): SafetyReport {
  const issues: SafetyIssue[] = [];
  const raw = texts.filter(Boolean).join("\n");
  const folded = normalise(raw);

  for (const word of SLURS) {
    if (new RegExp(`\\b${escapeRegex(normalise(word))}\\b`).test(folded)) {
      issues.push({ category: "slur", detail: word });
    }
  }

  for (const word of PROFANITY) {
    if (new RegExp(`\\b${escapeRegex(normalise(word))}\\b`).test(folded)) {
      issues.push({ category: "profanity", detail: word });
    }
  }

  const telugu = stripJoiners(raw);
  for (const word of TELUGU_PROFANITY) {
    if (containsTeluguTerm(telugu, word)) {
      issues.push({ category: "profanity", detail: word });
    }
  }

  for (const { pattern, label } of FORBIDDEN_TOPICS) {
    if (pattern.test(raw)) {
      issues.push({ category: "forbidden_topic", detail: label });
    }
  }

  for (const { pattern, label } of HARMFUL_CLAIMS) {
    if (pattern.test(raw)) {
      issues.push({ category: "harmful_claim", detail: label });
    }
  }

  for (const pattern of ARTEFACTS) {
    if (pattern.test(raw)) {
      issues.push({ category: "artefact", detail: pattern.source });
    }
  }

  return { safe: issues.length === 0, issues };
}
