import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { config, env } from "@/lib/env";

/**
 * Server-only Supabase client using the service-role key.
 *
 * RLS is enabled with no permissive policies, so this is the ONLY way the app
 * reads or writes the queue. Never import this from a "use client" file.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "spiritual-content-engine" } },
  });
  return cached;
}

/** Upload an MP3 and return its storage path plus a public playback URL. */
export async function uploadAudio(
  objectPath: string,
  audio: Buffer,
  contentType = "audio/mpeg",
): Promise<{ path: string; publicUrl: string }> {
  const supabase = supabaseAdmin();

  const { error } = await supabase.storage
    .from(config.audioBucket)
    .upload(objectPath, audio, {
      contentType,
      cacheControl: "31536000",
      upsert: true,
    });

  if (error) {
    throw new Error(
      `Failed to upload audio to bucket "${config.audioBucket}": ${error.message}. ` +
        `Did you run supabase/schema.sql (it creates the bucket)?`,
    );
  }

  const { data } = supabase.storage.from(config.audioBucket).getPublicUrl(objectPath);
  return { path: objectPath, publicUrl: data.publicUrl };
}

/** Best-effort cleanup used when a generation attempt is abandoned. */
export async function deleteAudio(objectPath: string): Promise<void> {
  try {
    await supabaseAdmin().storage.from(config.audioBucket).remove([objectPath]);
  } catch {
    /* nothing useful to do if cleanup fails */
  }
}

/** Where the renderer puts the finished MP4. */
export const VIDEO_BUCKET = "spiritual-video";

/**
 * Best-effort cleanup of a rendered MP4.
 *
 * Worth having its own function rather than being folded into deleteAudio: an
 * MP4 can be two hundred megabytes where an MP3 is under one, so a leaked
 * video is a different order of problem from a leaked narration.
 */
export async function deleteRenderedVideo(objectPath: string): Promise<void> {
  try {
    await supabaseAdmin().storage.from(VIDEO_BUCKET).remove([objectPath]);
  } catch {
    /* nothing useful to do if cleanup fails */
  }
}
