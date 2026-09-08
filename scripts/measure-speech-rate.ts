/**
 * Measure how fast the Telugu voices actually read.
 *
 * `tts_words_per_minute` is the number that turns a target duration into a
 * word window: the prompt asks for that many words, and the validator throws
 * the script away outside it. It shipped at 80, which was an estimate nobody
 * had checked, and the setting is called "Measured words per minute".
 *
 * So measure it. Edge is free, unmetered and needs no credentials, which makes
 * it the one part of this pipeline that can be calibrated from a laptop.
 *
 *   npx tsx scripts/measure-speech-rate.ts
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { synthesize } from "@/lib/tts/edge-tts";

/** Real narration in the register the master prompt asks for: plain, spoken, in scene. */
const SAMPLES: Array<{ label: string; text: string }> = [
  {
    label: "Gajendra",
    text:
      "మొసలి కాలు పట్టుకుంది. ఏనుగు లాగింది, మళ్ళీ లాగింది. వెయ్యి సంవత్సరాలు అలాగే గడిచాయి. " +
      "బలం అయిపోయింది. చివరికి ఏనుగు ఒక్క పువ్వు తొండంతో పైకి ఎత్తి, ఆకాశం వైపు చూసి పిలిచింది. " +
      "అప్పుడు విష్ణువు వచ్చాడు. గరుడుడి మీద కాదు, నడిచి వచ్చాడు. మొసలిని చంపి, ఏనుగును ఒడ్డుకు తీసుకొచ్చాడు.",
  },
  {
    label: "Markandeya",
    text:
      "పదహారు సంవత్సరాలు మాత్రమే అని చెప్పారు. ఆ రోజు వచ్చింది. యముడు తాడు విసిరాడు. " +
      "కుర్రాడు లింగాన్ని గట్టిగా పట్టుకున్నాడు. తాడు లింగం మీద పడింది. " +
      "అప్పుడు లింగం పగిలింది. శివుడు బయటికి వచ్చాడు. యముడిని కాలితో తన్నాడు. " +
      "మార్కండేయుడు పదహారు సంవత్సరాల వాడిగానే ఎప్పటికీ ఉండిపోయాడు.",
  },
];

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function probeSeconds(file: string): number {
  const out = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number(String(out.stdout).trim());
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "speech-rate-"));
  const rates: number[] = [];

  for (const voice of ["te-IN-ShrutiNeural", "te-IN-MohanNeural"]) {
    for (const sample of SAMPLES) {
      const result = await synthesize(sample.text, { voice });
      const file = join(dir, `${voice}-${sample.label}.mp3`);
      writeFileSync(file, result.audio);

      const seconds = probeSeconds(file);
      const count = words(sample.text);
      const wpm = (count / seconds) * 60;
      rates.push(wpm);

      console.log(
        `${voice.padEnd(22)} ${sample.label.padEnd(12)} ` +
          `${String(count).padStart(3)} words  ${seconds.toFixed(2).padStart(6)}s  ` +
          `${wpm.toFixed(1).padStart(6)} wpm`,
      );
    }
  }

  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  console.log(`\nmean: ${mean.toFixed(1)} words per minute across ${rates.length} takes`);
  console.log(`at 60s that is ${Math.round(mean)} words ideal, ` +
    `${Math.round(mean * 0.85)}-${Math.round(mean * 1.15)} accepted at the shipped tolerance`);
}

void main();
