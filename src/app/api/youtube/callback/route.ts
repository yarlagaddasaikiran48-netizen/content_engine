import { messageOf } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { writeSettings } from "@/lib/settings/store";
import { exchangeCodeForTokens, youtubeCallbackUri } from "@/lib/youtube/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Always land the operator back on Settings. A raw JSON error page at the end
 * of an OAuth round trip on a phone is a dead end; a redirect carrying the
 * reason is somewhere they can act.
 */
function backToSettings(request: Request, siteUrl: string, query: string): Response {
  const base = (siteUrl || new URL(request.url).origin).replace(/\/+$/, "");
  return Response.redirect(`${base}/settings?${query}`, 302);
}

/**
 * GET /api/youtube/callback?code=…
 *
 * Exchanges the authorisation code and stores the refresh token encrypted.
 */
export async function GET(request: Request) {
  const cfg = await loadConfig();
  const url = new URL(request.url);

  const denied = url.searchParams.get("error");
  if (denied) {
    return backToSettings(request, cfg.siteUrl, `youtube=error&detail=${encodeURIComponent(denied)}`);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return backToSettings(request, cfg.siteUrl, "youtube=error&detail=No+code+was+returned.");
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      cfg.youtubeClientId,
      cfg.youtubeClientSecret,
      // Must match the URI sent to the consent screen byte for byte.
      youtubeCallbackUri(cfg.siteUrl, url.origin),
    );

    if (!tokens.refresh_token) {
      // Almost always a repeat authorisation that reached Google without
      // prompt=consent, so it reissued only an access token.
      throw new Error(
        "Google returned no refresh token. Remove this app at myaccount.google.com/permissions, then connect again.",
      );
    }

    await writeSettings({ youtube_refresh_token: tokens.refresh_token });
    return backToSettings(request, cfg.siteUrl, "youtube=connected");
  } catch (error) {
    return backToSettings(
      request,
      cfg.siteUrl,
      `youtube=error&detail=${encodeURIComponent(messageOf(error))}`,
    );
  }
}
