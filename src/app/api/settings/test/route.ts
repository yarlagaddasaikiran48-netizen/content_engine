import { fail, messageOf, ok } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Target = "gemini" | "youtube" | "github";

/**
 * A live check per connection, so a wrong key is caught while the operator is
 * still looking at the field — rather than at 4am, when a publish slot passes
 * in silence and nobody is awake to notice.
 */
async function probe(target: Target): Promise<string> {
  const cfg = await loadConfig();

  if (target === "gemini") {
    if (cfg.geminiApiKeys.length === 0) throw new Error("No Gemini API key saved.");

    // Every key, not just the first. A second key exists precisely for the
    // moment the first is refused, so finding out then that it was mistyped
    // defeats the point of having added it.
    const results = await Promise.all(
      cfg.geminiApiKeys.map(async (key, index) => {
        const name = `Key ${index + 1}`;
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
            { cache: "no-store" },
          );
          if (!response.ok) return `${name}: rejected (HTTP ${response.status})`;
          const body = (await response.json()) as { models?: unknown[] };
          return `${name}: works, ${body.models?.length ?? 0} models`;
        } catch (error) {
          return `${name}: unreachable (${messageOf(error)})`;
        }
      }),
    );

    const working = results.filter((line) => line.includes("works")).length;
    if (working === 0) throw new Error(results.join(" · "));

    const summary = `${working} of ${cfg.geminiApiKeys.length} ${cfg.geminiApiKeys.length === 1 ? "key" : "keys"} working.`;
    // Distinct projects are the only thing that actually adds quota, and this
    // cannot tell whether two keys share one. Say so rather than imply a
    // doubling that may not exist.
    const note =
      cfg.geminiApiKeys.length > 1
        ? " Each key adds quota only if it came from a different Google account."
        : "";
    return `${summary} ${results.join(" · ")}.${note}`;
  }

  if (target === "github") {
    if (!cfg.githubOwner || !cfg.githubRepo) throw new Error("Owner and repo are both required.");
    if (!cfg.githubDispatchToken) throw new Error("No GitHub token saved.");
    const response = await fetch(
      `https://api.github.com/repos/${cfg.githubOwner}/${cfg.githubRepo}`,
      {
        headers: {
          Authorization: `Bearer ${cfg.githubDispatchToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Repo not found, or the token cannot see it."
          : `GitHub rejected the token (HTTP ${response.status}).`,
      );
    }
    return `Reached ${cfg.githubOwner}/${cfg.githubRepo}.`;
  }

  // YouTube: exchanging the refresh token proves the whole chain — client id,
  // secret and token — in one call, which is the chain a publish depends on.
  if (!cfg.youtubeRefreshToken) throw new Error("YouTube is not connected yet.");
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.youtubeClientId,
      client_secret: cfg.youtubeClientSecret,
      refresh_token: cfg.youtubeRefreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!token.ok) throw new Error("The saved refresh token was refused. Reconnect YouTube.");
  const { access_token: accessToken } = (await token.json()) as { access_token: string };

  const channel = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!channel.ok) throw new Error(`Could not read the channel (HTTP ${channel.status}).`);
  const body = (await channel.json()) as { items?: Array<{ snippet: { title: string } }> };
  const title = body.items?.[0]?.snippet.title;
  return title ? `Connected to "${title}".` : "Connected, but no channel was returned.";
}

/**
 * POST /api/settings/test  Body: `{ target: "gemini" | "youtube" | "github" }`
 */
export async function POST(request: Request) {
  let target: Target;
  try {
    const body = (await request.json()) as { target?: Target };
    if (body.target !== "gemini" && body.target !== "youtube" && body.target !== "github") {
      return fail('target must be "gemini", "youtube" or "github".', 400);
    }
    target = body.target;
  } catch (error) {
    return fail(messageOf(error), 400);
  }

  try {
    return ok({ target, healthy: true, detail: await probe(target) });
  } catch (error) {
    // A failed probe is information, not a server fault. Returning 200 with
    // healthy:false lets the UI show the reason instead of a generic error.
    return ok({ target, healthy: false, detail: messageOf(error) });
  }
}
