/**
 * YouTube Data API v3 — resumable video upload.
 *
 * Two steps: POST the metadata to open a session and get an upload URL, then
 * PUT the bytes to it. Resumable is the right choice even for small files
 * because it gives a clean retry story on a flaky connection.
 *
 * QUOTA: an upload costs 1600 units against a default daily budget of 10,000,
 * so roughly six uploads per day. The engine generates one per day, which
 * leaves plenty of headroom for retries.
 */

import { loadConfig } from "@/lib/settings/config";
import { getAccessToken } from "@/lib/youtube/oauth";

const UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

export interface UploadRequest {
  video: Buffer;
  title: string;
  description: string;
  tags: string[];
  /** Defaults come from env; overridable per call. */
  categoryId?: string;
  privacyStatus?: string;
  madeForKids?: boolean;
}

export interface UploadResult {
  videoId: string;
  url: string;
  shortsUrl: string;
}

/** YouTube rejects `<` and `>` anywhere in a title or description. */
function sanitiseMetadata(value: string): string {
  return value.replace(/[<>]/g, "");
}

/** Tags: max 500 characters total, no leading '#'. */
function prepareTags(tags: string[]): string[] {
  const out: string[] = [];
  let budget = 480;
  for (const tag of tags) {
    const clean = tag.replace(/^#/, "").replace(/[<>]/g, "").trim();
    if (!clean) continue;
    // continue, not break: one long tag used to discard every tag after it,
    // including short ones that would have fitted comfortably.
    if (clean.length + 1 > budget) continue;
    out.push(clean);
    budget -= clean.length + 1;
  }
  return out;
}

export async function uploadVideo(request: UploadRequest): Promise<UploadResult> {
  const config = await loadConfig();
  const accessToken = await getAccessToken();

  const metadata = {
    snippet: {
      title: sanitiseMetadata(request.title).slice(0, 100),
      description: sanitiseMetadata(request.description).slice(0, 5_000),
      tags: prepareTags(request.tags),
      categoryId: request.categoryId ?? config.youtubeCategoryId,
      // The listing metadata is English and the narration is Telugu, and
      // YouTube was told neither. defaultAudioLanguage is the one that earns
      // its place: it is how the video reaches Telugu speakers' recommendations
      // and how automatic captions know which language they are transcribing.
      defaultLanguage: "en",
      defaultAudioLanguage: "te",
    },
    status: {
      privacyStatus: request.privacyStatus ?? config.youtubePrivacy,
      selfDeclaredMadeForKids: request.madeForKids ?? config.youtubeMadeForKids,
      embeddable: true,
    },
  };

  // ---- 1. open a resumable session ----
  const initResponse = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(request.video.length),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });

  if (!initResponse.ok) {
    const detail = await initResponse.text();
    throw new Error(
      `YouTube refused to start the upload (HTTP ${initResponse.status}): ${detail}`,
    );
  }

  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) {
    throw new Error("YouTube did not return a resumable upload URL.");
  }

  // ---- 2. send the bytes ----
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(request.video.length),
    },
    body: new Uint8Array(request.video),
  });

  const responseText = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new Error(
      `YouTube upload failed (HTTP ${uploadResponse.status}): ${responseText}`,
    );
  }

  const result = JSON.parse(responseText) as { id?: string };
  if (!result.id) {
    throw new Error(`YouTube did not return a video id. Response: ${responseText}`);
  }

  return {
    videoId: result.id,
    url: `https://www.youtube.com/watch?v=${result.id}`,
    shortsUrl: `https://www.youtube.com/shorts/${result.id}`,
  };
}
