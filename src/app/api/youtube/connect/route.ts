import { fail, messageOf } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { YOUTUBE_SCOPE, youtubeCallbackUri } from "@/lib/youtube/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/connect
 *
 * Replaces the old `npm run auth:youtube` terminal dance, which could not be
 * run from a phone.
 *
 * `prompt=consent` is not optional: without it Google silently withholds the
 * refresh token on any repeat authorisation, and a refresh token is the only
 * thing worth collecting here.
 */
export async function GET(request: Request) {
  try {
    const cfg = await loadConfig();
    if (!cfg.youtubeClientId || !cfg.youtubeClientSecret) {
      return fail("Save the YouTube client ID and secret in Settings first.", 400);
    }

    const params = new URLSearchParams({
      client_id: cfg.youtubeClientId,
      redirect_uri: youtubeCallbackUri(cfg.siteUrl, new URL(request.url).origin),
      response_type: "code",
      scope: YOUTUBE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });

    return Response.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      302,
    );
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
