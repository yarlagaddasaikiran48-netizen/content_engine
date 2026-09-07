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
 *   fetch the row  ->  download the MP3  ->  build word-timed captions
 *   ->  FFmpeg composite  ->  YouTube resumable upload  ->  report back
 *
 * Backgrounds: drop any .jpg/.png files into assets/backgrounds/ and one is
 * picked at random with a slow Ken Burns push. With none present, FFmpeg
 * generates an animated gradient, so the pipeline needs no binary assets at
 * all and stays at zero cost.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { features } from "../src/lib/env";
import { uploadVideo } from "../src/lib/youtube/upload";
import type { SpiritualVideo } from "../src/lib/types";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

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

function timestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

/**
 * Split narration into short caption cues.
 *
 * Shorts are watched muted more often than not, so the captions carry the
 * script. Three to five words per cue is the sweet spot: long enough to read
 * in one glance, short enough to stay in rhythm with the voice.
 */
function buildCues(script: string, totalSeconds: number): Array<{
  start: number;
  end: number;
  text: string;
}> {
  const words = script.split(/\s+/).filter(Boolean);
  const groups: string[][] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    const endsClause = /[.!?,;:]$/.test(word);
    if (current.length >= 5 || (endsClause && current.length >= 3)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    // Avoid a lonely one-word final cue.
    if (current.length === 1 && groups.length > 0) groups[groups.length - 1].push(...current);
    else groups.push(current);
  }

  // Weight each cue by character count so long phrases hold the screen longer.
  const weights = groups.map((group) => group.join(" ").length);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;

  let elapsed = 0;
  return groups.map((group, index) => {
    const share = (weights[index] / totalWeight) * totalSeconds;
    const start = elapsed;
    elapsed += share;
    return {
      start,
      end: Math.min(elapsed, totalSeconds),
      text: group.join(" "),
    };
  });
}

function buildSrt(cues: Array<{ start: number; end: number; text: string }>): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`,
    )
    .join("\n");
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

function pickBackground(): string | null {
  if (!existsSync(BACKGROUND_DIR)) return null;
  const files = readdirSync(BACKGROUND_DIR).filter((name) =>
    /\.(jpe?g|png|webp)$/i.test(name),
  );
  if (files.length === 0) return null;
  return join(BACKGROUND_DIR, files[Math.floor(Math.random() * files.length)]);
}

/** libass style. Big, heavy, high-contrast — readable on a phone in daylight. */
const SUBTITLE_STYLE = [
  "Fontname=DejaVu Sans",
  "FontSize=17",
  "Bold=1",
  "PrimaryColour=&H00FFFFFF",
  "OutlineColour=&H00000000",
  "BackColour=&H90000000",
  "BorderStyle=1",
  "Outline=2.5",
  "Shadow=1",
  "Alignment=2", // bottom-centre
  "MarginV=260",
  "MarginL=90",
  "MarginR=90",
].join(",");

function escapeDrawText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "");
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
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

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Checked before rendering, not at the upload call: rendering costs minutes
    // of CI time, and failing afterwards would burn all of it to reach an error
    // that was knowable up front.
    if (!features.youtube) {
      throw new Error(
        "YouTube credentials are missing. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and " +
          "YOUTUBE_REFRESH_TOKEN (run `npm run youtube:token` to obtain the refresh token).",
      );
    }

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
    if (!video.audio_url) throw new Error("This row has no audio_url.");
    console.log(`  "${video.title}"`);

    // ---- 2. workspace ----
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });

    const audioPath = join(TMP_DIR, "narration.mp3");
    const srtPath = join(TMP_DIR, "captions.srt");
    const outputPath = join(TMP_DIR, "short.mp4");

    // ---- 3. audio ----
    const audioResponse = await fetch(video.audio_url);
    if (!audioResponse.ok) {
      throw new Error(`Could not download the audio (HTTP ${audioResponse.status}).`);
    }
    writeFileSync(audioPath, Buffer.from(await audioResponse.arrayBuffer()));

    const audioSeconds = probeDuration(audioPath);
    const duration = Number((audioSeconds + 0.6).toFixed(2));
    console.log(`  audio ${audioSeconds.toFixed(2)}s → video ${duration}s`);

    // ---- 4. captions ----
    writeFileSync(
      srtPath,
      buildSrt(buildCues(video.script_body, audioSeconds)),
      "utf8",
    );

    // ---- 5. composite ----
    const background = pickBackground();
    const footer = escapeDrawText(
      [video.scripture, video.reference].filter(Boolean).join(" · "),
    );

    // Filters are chained the same way for both background sources; only the
    // input differs. Running FFmpeg with cwd=TMP_DIR lets the subtitles filter
    // take a bare filename, which avoids the drive-letter escaping that breaks
    // this filter on Windows.
    const commonFilters = [
      `subtitles=captions.srt:force_style='${SUBTITLE_STYLE}'`,
      footer
        ? `drawtext=text='${footer}':fontcolor=white@0.72:fontsize=30:x=(w-text_w)/2:y=h-140`
        : null,
      "vignette=PI/5",
      `fade=t=in:st=0:d=0.5,fade=t=out:st=${(duration - 0.5).toFixed(2)}:d=0.5`,
      "format=yuv420p",
    ]
      .filter(Boolean)
      .join(",");

    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

    if (background) {
      console.log(`  background: ${background}`);
      const zoomFrames = Math.ceil(duration * FPS);
      args.push(
        "-loop", "1",
        "-i", background,
        "-i", "narration.mp3",
        "-filter_complex",
        `[0:v]scale=${WIDTH * 1.2}:${HEIGHT * 1.2}:force_original_aspect_ratio=increase,` +
          `crop=${WIDTH * 1.2}:${HEIGHT * 1.2},` +
          // Slow Ken Burns push so a still image never looks static.
          `zoompan=z='min(zoom+0.0006,1.15)':d=${zoomFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},` +
          `boxblur=6:1,eq=brightness=-0.10:saturation=1.15,` +
          commonFilters +
          "[v]",
      );
    } else {
      console.log("  background: generated gradient (no images in assets/backgrounds)");
      args.push(
        "-f", "lavfi",
        "-i",
        `gradients=size=${WIDTH}x${HEIGHT}:c0=0x140a24:c1=0x3d1b3a:c2=0x6d2f26:c3=0x1b1030:` +
          `n=4:type=radial:speed=0.012:rate=${FPS}:duration=${duration}`,
        "-i", "narration.mp3",
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

    // ---- 6. publish ----
    console.log("  uploading to YouTube…");
    const description = `${video.seo_description}\n\n${video.hashtags.join(" ")}`;
    const result = await uploadVideo({
      video: rendered,
      title: video.title,
      description,
      tags: video.hashtags,
    });

    console.log(`  published: ${result.shortsUrl}`);
    await report("published", { youtube_video_id: result.videoId });

    // Belt and braces: write the result directly too, in case the callback
    // could not reach the deployment.
    await supabase
      .from("spiritual_videos")
      .update({
        status: "published",
        youtube_video_id: result.videoId,
        youtube_url: result.shortsUrl,
        published_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    rmSync(TMP_DIR, { recursive: true, force: true });
    console.log("Done.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAILED: ${message}`);
    await report("failed", { error: message });
    await supabase
      .from("spiritual_videos")
      .update({ status: "failed", error_message: message.slice(0, 2_000) })
      .eq("id", videoId);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
