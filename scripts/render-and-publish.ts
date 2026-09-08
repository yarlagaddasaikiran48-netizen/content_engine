/**
 * Render a queued item into a 1080x1920 MP4 and publish it to YouTube.
 *
 *   npm run render -- --id=<video-uuid>
 *
 * This is the step Vercel cannot do. It runs on a GitHub Actions runner (free
 * minutes, FFmpeg preinstalled) triggered by the Approve button, and it runs
 * identically on your own machine for debugging.
 *
 * Pipeline:
 *   fetch the row  ->  download the narration  ->  build word-timed captions
 *   ->  FFmpeg composite  ->  YouTube resumable upload  ->  report back
 *
 * Backgrounds: file 1080x1920 .jpg/.png art under assets/backgrounds/<god>/ —
 * shiva, vishnu, krishna, devi and the rest — and the renderer picks one of
 * the god this episode is actually about, with a slow Ken Burns push. Loose
 * files directly in assets/backgrounds/ are the fallback for a god nothing is
 * filed under, and with the whole tree empty FFmpeg generates an animated
 * gradient, so the pipeline needs no binary assets at all and stays at zero
 * cost. See src/lib/render/deity.ts for the folder names.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadConfig, type AppConfig } from "../src/lib/settings/config";
import { uploadAudio } from "../src/lib/supabase/admin";
import { contentTypeFor, extensionFor, speak } from "../src/lib/tts";
import { deityFolder } from "../src/lib/render/deity";
import {
  buildAss,
  buildCues,
  gradientSource,
  kenBurns,
  CAPTION_FONT,
  FPS,
  HEIGHT,
  WIDTH,
} from "../src/lib/render/video";
import { normaliseTone } from "../src/lib/tts/voice";
import type { SpiritualVideo } from "../src/lib/types";

const TMP_DIR = resolve(process.cwd(), "tmp-render");
const BACKGROUND_DIR = resolve(process.cwd(), "assets", "backgrounds");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  return process.env[name.toUpperCase().replace(/-/g, "_")];
}

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      `Could not run ${command}: ${result.error.message}. Is it installed and on PATH?`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with code ${result.status}.\n${result.stderr?.slice(-4_000) ?? ""}`,
    );
  }
  return result.stdout;
}

function probeDuration(file: string): number {
  const output = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const seconds = Number.parseFloat(output.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe could not read a duration from ${file}.`);
  }
  return seconds;
}

/**
 * Refuse to render if the caption font is not installed.
 *
 * libass does not fail when it has no glyph for a character — it draws an
 * empty box and carries on, and FFmpeg exits 0. A whole Telugu narration comes
 * out as a row of tofu with nothing anywhere saying why, and the first thing
 * that notices is a viewer.
 *
 * Checked with fc-list, which is Linux-only. Where it is missing — a Windows
 * machine debugging a render — this says so and continues, because there the
 * system font fallback will find a Telugu face on its own.
 */
function assertFontPresent(font: string): void {
  let listed: string;
  try {
    listed = run("fc-list", [":", "family"]);
  } catch {
    console.log(`  fonts: no fc-list here; trusting the system to find "${font}".`);
    return;
  }

  if (listed.toLowerCase().includes(font.toLowerCase())) {
    console.log(`  fonts: "${font}" is installed.`);
    return;
  }

  throw new Error(
    `The caption font "${font}" is not installed, so the Telugu narration would ` +
      `burn in as empty boxes. Install it before rendering — on Ubuntu that is ` +
      `"sudo apt-get install -y fonts-noto-telugu && fc-cache -f".`,
  );
}

function imagesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .map((name) => join(dir, name));
}

/**
 * The background for this episode, preferring art of the god it is about.
 *
 * Looked up in assets/backgrounds/<deity>/ first, then the flat folder, then
 * nothing — which leaves FFmpeg to generate its gradient, and keeps the
 * pipeline working with no binary assets at all.
 *
 * The folder name comes from a closed list, never straight from the model, so
 * it cannot become a path that walks out of the backgrounds directory.
 */
function pickBackground(folder: string): { file: string | null; matched: boolean } {
  const specific = imagesIn(join(BACKGROUND_DIR, folder));
  if (specific.length > 0) {
    return { file: specific[Math.floor(Math.random() * specific.length)], matched: true };
  }

  const generic = imagesIn(BACKGROUND_DIR);
  if (generic.length > 0) {
    return { file: generic[Math.floor(Math.random() * generic.length)], matched: false };
  }

  return { file: null, matched: false };
}


/**
 * The container the stored narration is actually in.
 *
 * Edge TTS produces MP3 and Gemini TTS produces WAV, and rows of both kinds
 * exist at once for as long as the queue holds anything generated before the
 * switch. FFmpeg reads either quite happily, but it trusts the extension, so
 * writing WAV bytes to a file named .mp3 is how you get a demuxer error that
 * blames the audio rather than the name.
 */
function audioExtension(url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not an absolute URL. Fall through and read the string as given rather
    // than throwing: a malformed audio_url should fail at the download, with
    // the HTTP status attached, not here with a URL parser error.
  }
  const ext = /\.([a-z0-9]{2,4})(?:\?|#|$)/i.exec(path)?.[1]?.toLowerCase();
  return ext === "wav" || ext === "m4a" || ext === "ogg" ? ext : "mp3";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Speak the script, store the file, and write it back onto the row.
 *
 * The row is updated before the render continues, on purpose. A render that
 * dies at FFmpeg has already spent a speech request, and one of only ten a
 * day; without this the retry would spend another saying the identical words.
 * With it, the retry finds `audio_url` already set and skips straight past.
 *
 * The voice comes from the register the model wrote in — a woman's for the
 * gentle episodes, a man's for the fierce ones — which is why `tone` had to be
 * a column rather than a local variable.
 */
async function recordNarration(
  video: SpiritualVideo,
  cfg: AppConfig,
  db: SupabaseClient,
): Promise<string> {
  const log: string[] = [];
  const tone = normaliseTone(video.tone);

  console.log(`  recording narration (${tone})…`);
  const speech = await speak(video.script_body, cfg, { tone, log });
  for (const line of log) console.log(line);

  const objectPath =
    `${new Date().toISOString().slice(0, 10)}/` +
    `${Date.now()}-${slugify(video.title)}.${extensionFor(speech)}`;

  const { path, publicUrl } = await uploadAudio(
    objectPath,
    speech.audio,
    contentTypeFor(speech),
  );

  const { error: saveError } = await db
    .from("spiritual_videos")
    .update({
      audio_path: path,
      audio_url: publicUrl,
      audio_bytes: speech.bytes,
      duration_seconds: speech.durationSeconds,
      voice: speech.voice,
    })
    .eq("id", video.id);

  // This write is the entire reason the narration is recorded once rather than
  // on every retry, and its result was being discarded. If it fails silently,
  // the MP3 sits in storage with no audio_path pointing at it -- so nothing
  // will ever delete it -- and the next attempt sees a null audio_url and
  // spends another Gemini speech request, out of ten for the whole day.
  if (saveError) {
    throw new Error(
      `The narration was recorded and uploaded, but the row could not be updated ` +
        `(${saveError.message}). Retrying would spend another of the day's ten speech ` +
        `requests, so this stops here. The audio is at ${publicUrl}.`,
    );
  }

  console.log(`  narration ${speech.durationSeconds}s in ${speech.voice}`);
  return publicUrl;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const videoId = arg("id") ?? arg("video-id");
  if (!videoId) {
    console.error("Usage: npm run render -- --id=<video-uuid>");
    process.exit(1);
  }

  const callbackUrl = arg("callback-url") ?? process.env.CALLBACK_URL ?? "";
  const callbackSecret = process.env.PUBLISH_CALLBACK_SECRET ?? "";

  async function report(status: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (!callbackUrl || !callbackSecret) return;
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publish-secret": callbackSecret,
        },
        body: JSON.stringify({ video_id: videoId, status, ...extra }),
      });
    } catch (error) {
      console.warn(`Callback failed: ${(error as Error).message}`);
    }
  }

  // Built before anything is validated, deliberately. Missing credentials used
  // to throw above this point, which left no way to say so: the row kept the
  // "rendering" that approval had set and stayed there forever, with the reason
  // visible only to whoever opened the Actions log. Everything that can fail now
  // happens below, inside the try, where it gets reported.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const supabase =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;

  /** Report a terminal failure through every channel still available. */
  async function markFailed(message: string): Promise<void> {
    console.error(`FAILED: ${message}`);
    // The callback goes first: when the credentials are what is missing, it is
    // the only route left, since the direct write below needs them.
    await report("failed", { error: message });
    if (supabase) {
      await supabase
        .from("spiritual_videos")
        .update({ status: "failed", error_message: message.slice(0, 2_000) })
        .eq("id", videoId);
    }
  }

  try {
    if (!supabase) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. On a GitHub " +
          "Actions runner they come from repository secrets — Settings → Secrets and " +
          "variables → Actions.",
      );
    }

    // No YouTube check here any more. This job used to upload as well as
    // render, so checking the credentials before spending CI minutes was
    // right. Uploading moved to publish-video.ts, and the check did not: a
    // disconnected YouTube account failed the RENDER, marking the row failed
    // and showing the operator an error about the wrong job entirely. The
    // publish script checks its own credentials, which is where it belongs.
    const cfg = await loadConfig();

    console.log(`Rendering ${videoId}`);
    await report("rendering");

    // ---- 1. load the row ----
    const { data, error } = await supabase
      .from("spiritual_videos")
      .select("*")
      .eq("id", videoId)
      .maybeSingle();

    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    if (!data) throw new Error(`No video with id ${videoId}.`);

    const video = data as SpiritualVideo;
    console.log(`  "${video.title}" (${video.tone ?? "soft"})`);

    // ---- 2. workspace ----
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });

    const captionPath = join(TMP_DIR, "captions.ass");
    const outputPath = join(TMP_DIR, "short.mp4");

    // ---- 3. audio ----
    //
    // Recorded here, not when the script was written. The Gemini speech model
    // allows ten requests a day on the free tier against twenty for text, so
    // narrating every script the engine produced meant the scripts nobody
    // approved were spending the scarcer budget of the two. Only an approved
    // script reaches this point, so only an approved script costs a request.
    //
    // A row that already carries audio still uses it: rows written before the
    // change, and re-runs of a render that failed after the upload.
    const audioUrl = video.audio_url ?? (await recordNarration(video, cfg, supabase));

    // Follow the stored object rather than assume MP3. Gemini narration is
    // WAV, Edge narration is MP3, and rows of both kinds outlive the switch.
    // FFmpeg reads either, but only if the extension does not lie about which.
    const audioFile = `narration.${audioExtension(audioUrl)}`;
    const audioPath = join(TMP_DIR, audioFile);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Could not download the audio (HTTP ${audioResponse.status}).`);
    }
    writeFileSync(audioPath, Buffer.from(await audioResponse.arrayBuffer()));

    const audioSeconds = probeDuration(audioPath);

    // ---- 3b. the duration gate ----
    //
    // Word count only *predicts* spoken length; long words and heavy
    // punctuation both defeat it. This used to run inside the generator, where
    // the real MP3 already existed. It runs here now for the same reason the
    // narration does, and it still runs before the upload, so an overlong take
    // costs a render rather than reaching the channel.
    const longest = cfg.targetSeconds * (1 + cfg.wordCountTolerance);
    const shortest = cfg.targetSeconds * (1 - cfg.wordCountTolerance);
    if (audioSeconds > longest || audioSeconds < shortest) {
      throw new Error(
        `The narration came out ${audioSeconds.toFixed(1)}s against a ${cfg.targetSeconds}s ` +
          `target (allowed ${shortest.toFixed(1)}-${longest.toFixed(1)}s). ` +
          `Discard it and let the engine write another, or widen "Length tolerance" in Settings.`,
      );
    }
    const duration = Number((audioSeconds + 0.6).toFixed(2));
    console.log(`  audio ${audioSeconds.toFixed(2)}s → video ${duration}s`);

    // Replace the speech engine's estimate with the length ffprobe measured.
    // The estimate is what the row carried, what the archive inherits, and
    // what the hook score is computed against: three seconds into a video is a
    // FRACTION of its runtime, so a wrong duration samples the retention curve
    // at the wrong place and compares one video's first three seconds against
    // another's first four.
    await supabase
      .from("spiritual_videos")
      .update({ duration_seconds: duration })
      .eq("id", videoId);

    // ---- 4. captions ----
    assertFontPresent(CAPTION_FONT);
    // Every piece of on-screen text goes through this one file, so it all
    // resolves through the same font that assertFontPresent just checked.
    writeFileSync(
      captionPath,
      buildAss({
        cues: buildCues(video.script_body, audioSeconds),
        footer: [video.scripture, video.reference].filter(Boolean).join(" · "),
        endCard: cfg.endCardText.trim()
          ? {
              text: cfg.endCardText.trim(),
              from: Math.max(0, duration - cfg.endCardSeconds),
              to: duration,
            }
          : null,
      }),
      "utf8",
    );

    // ---- 5. composite ----
    //
    // The god the episode is about decides what is behind it. Which is only
    // as good as what is filed under assets/backgrounds/<god>/ — with nothing
    // there, this still lands on the generated gradient, and the log says so
    // rather than leaving you to wonder why every video looks the same.
    const folder = deityFolder(video.deity, video.scripture);
    const { file: background, matched } = pickBackground(folder);
    console.log(
      background
        ? `  background: ${matched ? `${folder} — matched the episode` : "generic (no art filed under " + folder + ")"}`
        : `  background: generated gradient — nothing in assets/backgrounds/${folder}/ or the folder above it`,
    );
    // Filters are chained the same way for both background sources; only the
    // input differs. Running FFmpeg with cwd=TMP_DIR lets the subtitles filter
    // take a bare filename, which avoids the drive-letter escaping that breaks
    // this filter on Windows.
    const commonFilters = [
      // No force_style: buildAss declares PlayRes and every style itself, and
      // carries the footer and the subscribe card as well as the captions —
      // there are no drawtext filters left to disagree with it about fonts.
      "subtitles=captions.ass",
      "vignette=PI/5",
      // A little grain, added last so it sits over the whole composite rather
      // than being smeared by the scaler. It costs a few hundred KB and stops
      // large flat areas — a sky, a gradient — banding into visible steps on a
      // phone screen, which is the other thing that reads as cheap.
      "noise=alls=4:allf=t",
      `fade=t=in:st=0:d=0.5,fade=t=out:st=${(duration - 0.5).toFixed(2)}:d=0.5`,
      "format=yuv420p",
    ]
      .filter(Boolean)
      .join(",");

    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

    if (background) {
      args.push(
        "-loop", "1",
        "-i", background,
        "-i", audioFile,
        "-filter_complex",
        `[0:v]${kenBurns(duration)},` +
          // Was boxblur=6:1. That existed to stop a decorative background
          // competing with the captions, and it is exactly wrong now that the
          // background is the subject: it blurred the god into a wash. The
          // captions stay readable on a heavier outline and a real shadow
          // instead, and the image keeps its detail.
          `eq=brightness=-0.06:saturation=1.12:contrast=1.04,` +
          commonFilters +
          "[v]",
      );
    } else {
      args.push(
        "-f", "lavfi",
        // No artwork for this god, so the palette carries the difference
        // instead — see gradientSource.
        "-i", gradientSource(folder, duration),
        "-i", audioFile,
        "-filter_complex", `[0:v]${commonFilters}[v]`,
      );
    }

    args.push(
      "-map", "[v]",
      "-map", "1:a",
      "-t", String(duration),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "21",
      "-profile:v", "high",
      "-level", "4.0",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-g", String(FPS * 2),
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "48000",
      "-movflags", "+faststart",
      "short.mp4",
    );

    console.log("  running ffmpeg…");
    run("ffmpeg", args, TMP_DIR);

    const rendered = readFileSync(outputPath);
    console.log(`  rendered ${(rendered.length / 1024 / 1024).toFixed(2)} MB`);

    // ---- 6. store the MP4 for review ----
    //
    // Rendering stops here on purpose. The file goes to storage and the row is
    // marked "ready", so it can be watched before it reaches the channel.
    // Publishing is a separate job, fired by the Post button.
    const objectPath = `${new Date().toISOString().slice(0, 10)}/${videoId}.mp4`;
    console.log("  uploading the MP4 to storage…");

    const { error: storeError } = await supabase.storage
      .from("spiritual-video")
      .upload(objectPath, rendered, { contentType: "video/mp4", upsert: true });

    if (storeError) {
      throw new Error(`Could not store the rendered video: ${storeError.message}`);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("spiritual-video").getPublicUrl(objectPath);

    console.log(`  ready to preview: ${publicUrl}`);
    await report("ready", { video_url: publicUrl });

    // Belt and braces: write the result directly too, in case the callback
    // could not reach the deployment.
    await supabase
      .from("spiritual_videos")
      .update({
        status: "ready",
        video_path: objectPath,
        video_url: publicUrl,
        video_bytes: rendered.length,
        rendered_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    rmSync(TMP_DIR, { recursive: true, force: true });
    console.log("Done.");
  } catch (error) {
    await markFailed(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
