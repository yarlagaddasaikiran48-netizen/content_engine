/**
 * GitHub Actions dispatch — the answer to "Vercel cannot run FFmpeg".
 *
 * Vercel's serverless functions cap out at 60 seconds on the Hobby plan with a
 * 250 MB bundle, so compositing a 1080x1920 video there is not viable. GitHub
 * Actions gives every account free runner minutes on a machine that already
 * has FFmpeg installed, with no execution time limit worth worrying about.
 *
 * Pressing Approve therefore fires a `repository_dispatch`, and the workflow
 * in .github/workflows/render-and-publish.yml does the heavy work, then calls
 * back to /api/publish/callback with the resulting YouTube id.
 */

import { loadConfig } from "@/lib/settings/config";

export interface DispatchPayload {
  video_id: string;
  callback_url: string;
}

export async function dispatchRender(payload: DispatchPayload): Promise<void> {
  const env = await loadConfig();
  const url = `https://api.github.com/repos/${env.githubOwner}/${env.githubRepo}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.githubDispatchToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "render-video",
      client_payload: payload,
    }),
  });

  // A successful dispatch returns 204 No Content.
  if (response.status !== 204) {
    const detail = await response.text();
    throw new Error(
      `GitHub dispatch failed (HTTP ${response.status}): ${detail}. ` +
        `Check that GITHUB_DISPATCH_TOKEN has "Contents: Read and write" on ${env.githubOwner}/${env.githubRepo}.`,
    );
  }
}
