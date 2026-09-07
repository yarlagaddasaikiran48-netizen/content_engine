/**
 * Publish an already-rendered video, then erase it.
 *
 * This is the second half of what used to be one job. Rendering now stops at a
 * watchable MP4; this takes that exact file — the one the operator approved,
 * not a re-render that might differ — and puts it on YouTube.
 *
 * Afterwards the row is archived and deleted. The archive is deliberately
 * slim, but it is not optional: the duplicate-phrasing defence compares each
 * new script against recent script bodies, and deleting published rows without
 * keeping the text would silently switch that defence off.
 *
 * Runs on a GitHub Actions runner rather than in a Vercel function because a
 * resumable upload of a multi-megabyte file does not belong inside a 60-second
 * request.
 *
 *   npx tsx scripts/publish-video.ts --id=<uuid> [--callback-url=...]
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

import { uploadVideo } from "../src/lib/youtube/upload";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(name: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main(): Promise<void> {
  const videoId = arg("id") ?? process.env.VIDEO_ID;
  if (!videoId) throw new Error("Pass --id=<uuid>.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const callbackUrl = arg("callback-url") ?? process.env.CALLBACK_URL ?? "";
  const callbackSecret = process.env.PUBLISH_CALLBACK_SECRET ?? "";

  async function report(status: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (!callbackUrl || !callbackSecret) return;
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-publish-secret": callbackSecret },
        body: JSON.stringify({ video_id: videoId, status, ...extra }),
      });
    } catch (error) {
      console.warn(`  callback failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  const { data, error } = await supabase
    .from("spiritual_videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No video with id ${videoId}.`);

  const video = data as {
    id: string;
    title: string;
    seo_description: string;
    hashtags: string[];
    status: string;
    video_path: string | null;
    video_url: string | null;
    audio_path: string | null;
  };

  if (video.status !== "ready") {
    throw new Error(`Video is "${video.status}", not "ready". Nothing to publish.`);
  }
  if (!video.video_path) {
    throw new Error("This video has no rendered file. Render it again.");
  }

  try {
    console.log(`Publishing ${videoId}: ${video.title}`);

    // ---- 1. fetch the exact file the operator watched ----
    const { data: file, error: downloadError } = await supabase.storage
      .from("spiritual-video")
      .download(video.video_path);

    if (downloadError || !file) {
      throw new Error(`Could not fetch the rendered video: ${downloadError?.message}`);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    console.log(`  fetched ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);

    // ---- 2. upload ----
    const description = `${video.seo_description}\n\n${video.hashtags.join(" ")}`;
    const result = await uploadVideo({
      video: bytes,
      title: video.title,
      description,
      tags: video.hashtags,
    });

    console.log(`  published: ${result.shortsUrl}`);
    await report("published", { youtube_video_id: result.videoId });

    // ---- 3. archive, then delete ----
    //
    // The archive insert and the row delete happen inside one database
    // function, so the video cannot end up both archived and still queued.
    const { error: archiveError } = await supabase.rpc("publish_and_archive", {
      p_id: videoId,
      p_youtube_video_id: result.videoId,
      p_youtube_url: result.shortsUrl,
    });

    if (archiveError) {
      // The video IS live. Say so loudly rather than failing the job in a way
      // that invites a retry and a duplicate upload.
      console.error(
        `  PUBLISHED but not archived: ${archiveError.message}. ` +
          `The video is live at ${result.shortsUrl}; the row must be cleaned up by hand.`,
      );
      return;
    }

    // ---- 4. remove the media, which nothing needs any more ----
    const removals: Array<Promise<unknown>> = [
      supabase.storage.from("spiritual-video").remove([video.video_path]),
    ];
    if (video.audio_path) {
      removals.push(supabase.storage.from("spiritual-audio").remove([video.audio_path]));
    }
    await Promise.allSettled(removals);

    console.log("  archived, row deleted, media removed.");
    console.log("Done.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAILED: ${message}`);
    await report("failed", { error: message });
    await supabase
      .from("spiritual_videos")
      .update({ status: "failed", error_message: message.slice(0, 2_000) })
      .eq("id", videoId);
    process.exitCode = 1;
  }
}

void main();
