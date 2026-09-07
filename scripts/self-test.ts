/**
 * Offline self-test.
 *
 *   npm run selftest
 *
 * Exercises every pure module — panchang, safety filter, validator, dedupe,
 * corpus — plus the two read-only network sources. Touches no credentials, so
 * it works before Supabase, Gemini or YouTube are configured, and it is the
 * fastest way to confirm a fresh clone is healthy.
 */

import "dotenv/config";

import { contentHash, jaccardSimilarity } from "@/lib/dedupe/hash";
import { checkSafety } from "@/lib/safety/profanity";
import { MAX_WORDS, MIN_WORDS, validateScript } from "@/lib/safety/validate";
import { fetchGitaVerse } from "@/lib/sources/gita";
import { buildHookContext } from "@/lib/sources/hook";
import { computePanchang } from "@/lib/sources/panchang";
import { assertUniqueKeys, CORPUS } from "@/lib/sources/puranas";

let failures = 0;

function check(label: string, passed: boolean, detail = ""): void {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const SAMPLE = {
  title: "Dhruva Refused To Move And The Sky Followed",
  script_body:
    "You were told there was no room for you. A child heard that once, from his " +
    "own father's lap, and walked into the forest instead of arguing. He did not " +
    "shout. He simply refused to move from where he stood. The sky rearranged " +
    "itself around him, and every star still turns around that one fixed point " +
    "tonight. Whatever pushed you aside today was not the end of your story.",
  seo_description:
    "The story of Dhruva from the Vishnu Purana, and what it means to stay fixed " +
    "when you have been pushed aside. Vishnu Purana, Book 1, Chapters 11 to 12.",
  hashtags: ["#Dhruva", "#VishnuPurana", "#Spirituality", "#Bhakti", "#Sanatan"],
};

async function main(): Promise<void> {
  console.log("\nPanchang");
  const panchang = computePanchang();
  check("computes a tithi", panchang.tithiNumber >= 1 && panchang.tithiNumber <= 30, panchang.label);
  check("computes a lunar month", Boolean(panchang.lunarMonth));
  console.log(
    `        observances: ${panchang.observances.length ? panchang.observances.join(" | ") : "(none today)"}`,
  );

  console.log("\nSafety filter");
  check("allows clean devotional text", checkSafety(SAMPLE.title, SAMPLE.script_body).safe);
  check(
    "blocks profanity, politics and medical claims",
    !checkSafety("this is sh1t, vote BJP, it cures cancer").safe,
  );
  check("defeats character obfuscation", !checkSafety("what the f*u*c*k").safe);
  check("blocks caste content", !checkSafety("people of lower caste should not enter").safe);
  check("blocks model artefacts", !checkSafety("As an AI, I cannot do that").safe);

  console.log("\nScript validation");
  const valid = validateScript(SAMPLE);
  check(
    `accepts a good script (${MIN_WORDS}-${MAX_WORDS} words)`,
    valid.valid,
    `${valid.wordCount} words${valid.valid ? "" : `: ${valid.errors.join("; ")}`}`,
  );
  check("rejects a too-short script", !validateScript({ ...SAMPLE, script_body: "Too short." }).valid);
  check(
    "rejects the wrong number of hashtags",
    !validateScript({ ...SAMPLE, hashtags: ["#one"] }).valid,
  );
  check(
    "rejects a call to action in the narration",
    !validateScript({
      ...SAMPLE,
      script_body: `${SAMPLE.script_body} Subscribe for more.`,
    }).valid,
  );
  const stripped = validateScript({
    ...SAMPLE,
    script_body: `(pause) Narrator: ${SAMPLE.script_body} **emphasis**`,
  });
  check(
    "strips stage directions and markdown",
    !stripped.cleaned.script_body.includes("(pause)") &&
      !stripped.cleaned.script_body.includes("Narrator:") &&
      !stripped.cleaned.script_body.includes("**"),
  );

  console.log("\nDuplicate detection");
  const disguised = SAMPLE.script_body.toUpperCase().replace(/\./g, "!");
  check(
    "same hash after re-punctuating and re-casing",
    contentHash(SAMPLE.script_body) === contentHash(disguised),
  );
  check(
    "different hash for different content",
    contentHash(SAMPLE.script_body) !== contentHash("Gajendra called out and Vishnu came."),
  );
  check("identical text scores 1.0", jaccardSimilarity(SAMPLE.script_body, SAMPLE.script_body) === 1);
  const unrelated = jaccardSimilarity(
    SAMPLE.script_body,
    "Gajendra the elephant king fought the crocodile for a thousand years before he let go.",
  );
  check("unrelated text scores low", unrelated < 0.2, unrelated.toFixed(3));

  console.log("\nCorpus");
  assertUniqueKeys();
  const scriptures = [...new Set(CORPUS.map((entry) => entry.scripture))];
  check("curated topics have unique keys", true, `${CORPUS.length} topics`);
  check("covers multiple scriptures", scriptures.length >= 10, `${scriptures.length} books`);
  console.log(`        ${scriptures.join(", ")}`);

  console.log("\nLive sources");
  try {
    const verse = await fetchGitaVerse(2, 47);
    check(
      "Bhagavad Gita API returns a real verse",
      Boolean(verse?.sanskrit && verse.translation),
      verse ? `${verse.translator}: ${verse.translation.slice(0, 60)}…` : "no data",
    );
  } catch (error) {
    check("Bhagavad Gita API reachable", false, (error as Error).message);
  }

  try {
    const hook = await buildHookContext();
    check("hook context builds", hook.summary.length > 20);
    console.log(`        ${hook.summary}`);
  } catch (error) {
    check("hook context builds", false, (error as Error).message);
  }

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
