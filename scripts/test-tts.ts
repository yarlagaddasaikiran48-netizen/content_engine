/**
 * Smoke-test the Edge TTS client without touching Supabase or Gemini.
 *
 *   npm run tts:test
 *   npm run tts:test -- --voices          list every Indian voice
 *   npm run tts:test -- --text="..."      speak your own line
 *
 * Writes tmp-tts/sample.mp3 so you can listen to it.
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { listVoices, synthesize } from "../src/lib/tts/edge-tts";

const DEFAULT_TEXT =
  "You have the right to work, but never to the fruit of your work. " +
  "Do not let the results be your motive, and do not be attached to inaction.";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  if (process.argv.includes("--voices")) {
    const voices = await listVoices();
    const indian = voices.filter((voice) => voice.Locale.endsWith("-IN"));
    console.log(`${voices.length} voices available. Indian voices:\n`);
    for (const voice of indian) {
      console.log(`  ${voice.ShortName.padEnd(30)} ${voice.Gender.padEnd(8)} ${voice.Locale}`);
    }
    return;
  }

  const text = arg("text") ?? DEFAULT_TEXT;
  const voice = arg("voice") ?? process.env.TTS_VOICE ?? "en-IN-NeerjaNeural";

  console.log(`Voice: ${voice}`);
  console.log(`Text:  ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}\n`);

  const started = Date.now();
  const result = await synthesize(text, {
    voice,
    rate: process.env.TTS_RATE ?? "-4%",
    pitch: process.env.TTS_PITCH ?? "+0Hz",
    volume: process.env.TTS_VOLUME ?? "+0%",
  });

  const dir = resolve(process.cwd(), "tmp-tts");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "sample.mp3");
  writeFileSync(file, result.audio);

  console.log(`Synthesised in ${Date.now() - started}ms`);
  console.log(`  duration : ${result.durationSeconds}s`);
  console.log(`  size     : ${(result.bytes / 1024).toFixed(1)} KB`);
  console.log(`  written  : ${file}`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
