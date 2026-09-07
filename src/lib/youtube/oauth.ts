/**
 * YouTube OAuth.
 *
 * Uses a long-lived refresh token minted once by the Connect YouTube button on
 * the Settings page, so the server never needs an interactive consent flow.
 * Deliberately avoids the `googleapis` package: it is ~100 MB installed and
 * would eat most of Vercel's serverless bundle budget to do two HTTP calls.
 */

import { loadConfig } from "@/lib/settings/config";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Upload is what publishes; the two readonly scopes are what make the
 * Performance page possible — retention data is unreachable without
 * yt-analytics.readonly, and resolving a video's metadata needs
 * youtube.readonly.
 *
 * Widening this list invalidates any refresh token minted under the old,
 * narrower set, so reconnecting once is required after this change.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** Space-delimited form, as Google's endpoints expect it. */
export const YOUTUBE_SCOPE = YOUTUBE_SCOPES.join(" ");

/**
 * The redirect URI, which must match byte for byte in three places: the
 * consent request, the token exchange, and the authorised list in Google Cloud
 * Console. Deriving it in one function is what keeps those three in agreement.
 *
 * Lives here rather than in a route file because Next.js allows route modules
 * to export only route handlers and their config.
 */
export function youtubeCallbackUri(siteUrl: string, fallbackOrigin: string): string {
  const base = (siteUrl || fallbackOrigin).replace(/\/+$/, "");
  return `${base}/api/youtube/callback`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  refresh_token?: string;
}

/** Cached in module scope; a warm serverless instance reuses it. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const cfg = await loadConfig();
  if (!cfg.youtubeRefreshToken) {
    throw new Error("YouTube is not connected. Open Settings and press Connect YouTube.");
  }

  const body = new URLSearchParams({
    client_id: cfg.youtubeClientId,
    client_secret: cfg.youtubeClientSecret,
    refresh_token: cfg.youtubeRefreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `YouTube token refresh failed (HTTP ${response.status}): ${text}. ` +
        `If this says invalid_grant, the refresh token was revoked — open Settings and press Connect YouTube again. ` +
        `Note that tokens for an app still in "Testing" on the OAuth consent screen expire after 7 days.`,
    );
  }

  const token = JSON.parse(text) as TokenResponse;
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1_000,
  };
  return token.access_token;
}

/** Exchange an authorisation code for a refresh token (used by the OAuth callback). */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token exchange failed (HTTP ${response.status}): ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}
