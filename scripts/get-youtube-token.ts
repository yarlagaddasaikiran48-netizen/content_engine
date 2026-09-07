/**
 * One-time helper: mint a YouTube refresh token.
 *
 *   npm run auth:youtube
 *
 * Requires YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local, from an
 * OAuth client of type "Desktop app" in Google Cloud Console. Desktop clients
 * accept a loopback redirect on any port, so no redirect URI needs registering.
 *
 * Prints a refresh token to paste into .env.local and into Vercel.
 */

import "dotenv/config";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

import { exchangeCodeForTokens, YOUTUBE_SCOPE } from "../src/lib/youtube/oauth";

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}`;

function openBrowser(url: string): void {
  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

async function main(): Promise<void> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .env.local.\n\n" +
        "Get them from https://console.cloud.google.com:\n" +
        "  1. Create a project and enable 'YouTube Data API v3'\n" +
        "  2. OAuth consent screen → External → add your own email as a Test user\n" +
        "  3. Credentials → Create OAuth client ID → Desktop app\n",
    );
    process.exit(1);
  }

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: YOUTUBE_SCOPE,
      access_type: "offline",
      // Forces a refresh token even if this app was authorised before.
      prompt: "consent",
    }).toString();

  console.log("\nOpen this URL and approve access:\n");
  console.log(authUrl);
  console.log("\nWaiting for the redirect…\n");
  openBrowser(authUrl);

  const code = await new Promise<string>((resolvePromise, rejectPromise) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", REDIRECT_URI);
      const received = url.searchParams.get("code");
      const failure = url.searchParams.get("error");

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
         <body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#faf7f2;color:#1c1917">
           <div style="text-align:center;padding:24px">
             <h1 style="font-size:20px">${received ? "Authorised" : "Authorisation failed"}</h1>
             <p style="color:#6b6259">${received ? "You can close this tab and return to the terminal." : failure ?? "No code was returned."}</p>
           </div>
         </body>`,
      );

      server.close();
      if (received) resolvePromise(received);
      else rejectPromise(new Error(failure ?? "No authorisation code received."));
    });

    server.listen(PORT, () => {
      /* listening */
    });
    server.on("error", rejectPromise);

    setTimeout(() => {
      server.close();
      rejectPromise(new Error("Timed out after 5 minutes."));
    }, 300_000);
  });

  const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, REDIRECT_URI);

  if (!tokens.refresh_token) {
    console.error(
      "\nGoogle did not return a refresh token. Revoke this app at " +
        "https://myaccount.google.com/permissions and run the command again.",
    );
    process.exit(1);
  }

  console.log("\nSuccess. Add this to .env.local and to Vercel:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log(
    "Note: while your OAuth consent screen is in 'Testing', Google expires\n" +
      "refresh tokens after 7 days. Publish the app (no verification is needed\n" +
      "for a personal channel) to make it permanent.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
