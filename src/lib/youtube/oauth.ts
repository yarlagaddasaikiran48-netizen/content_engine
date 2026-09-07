/**
 * YouTube OAuth.
 *
 * Uses a long-lived refresh token minted once by `npm run auth:youtube`, so
 * the server never needs an interactive consent flow. Deliberately avoids the
 * `googleapis` package: it is ~100 MB installed and would eat most of Vercel's
 * serverless bundle budget to do two HTTP calls.
 */

import { env } from "@/lib/env";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Only the upload scope. Nothing else is needed to publish a Short. */
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

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

  const body = new URLSearchParams({
    client_id: env.youtubeClientId,
    client_secret: env.youtubeClientSecret,
    refresh_token: env.youtubeRefreshToken,
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
        `If this says invalid_grant, the refresh token was revoked — run \`npm run auth:youtube\` again. ` +
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

/** Exchange an authorisation code for a refresh token (used by the CLI helper). */
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
