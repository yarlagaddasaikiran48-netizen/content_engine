/**
 * Reading a response without assuming it is JSON.
 *
 * Every API route in this app returns JSON, including for its own errors --
 * which is exactly why `response.json()` was called everywhere without a
 * second thought. The gap is that not every response comes from a route. When
 * a serverless function overruns its time limit, or fails to boot, or the
 * deployment is mid-swap, the platform answers instead, in plain text:
 *
 *     An error occurred with your deployment
 *     FUNCTION_INVOCATION_TIMEOUT
 *
 * `response.json()` on that throws `Unexpected token 'A'`, which is what the
 * operator sees: a parser complaint about the letter A, with no hint that the
 * server timed out, and the real failure nowhere on screen.
 *
 * So: read the body as text first, try to parse it, and if it is not JSON say
 * what it actually was.
 */

/** Platform failures worth translating out of Vercel's shorthand. */
const PLATFORM_ERRORS: Record<string, string> = {
  FUNCTION_INVOCATION_TIMEOUT:
    "The server ran out of time (60 seconds) and was stopped before it could answer. Nothing was saved. Try again — it carries on from where it stopped.",
  FUNCTION_INVOCATION_FAILED:
    "The server crashed before it could answer. Check the Vercel logs for this deployment.",
  FUNCTION_PAYLOAD_TOO_LARGE: "The server tried to send back more than it is allowed to.",
  NO_RESPONSE_FROM_FUNCTION: "The server accepted the request and then said nothing.",
  DEPLOYMENT_NOT_FOUND: "This deployment no longer exists. Reload the page.",
  DEPLOYMENT_PAUSED: "The deployment is paused in Vercel.",
};

/**
 * Explain a body that would not parse.
 *
 * Prefers the `x-vercel-error` header, which names the failure exactly, and
 * falls back to sniffing the body for the same codes — the header is absent on
 * some edge paths and the code is in the text either way.
 */
export function describeNonJson(response: Response, body: string): string {
  const header = response.headers.get("x-vercel-error");
  const code =
    header ?? Object.keys(PLATFORM_ERRORS).find((name) => body.includes(name)) ?? null;

  if (code && PLATFORM_ERRORS[code]) return PLATFORM_ERRORS[code];
  if (code) return `The server failed with ${code}.`;

  // An HTML page means a login wall or a proxy, not our API. Worth saying so
  // rather than quoting a doctype at somebody.
  if (/^\s*<(!doctype|html)/i.test(body)) {
    return `The server returned a web page instead of data (HTTP ${response.status}). If this app is behind Vercel's deployment protection, turn it off — it redirects API calls to a login page.`;
  }

  const snippet = body.trim().slice(0, 200);
  return snippet
    ? `The server returned something that is not data (HTTP ${response.status}): ${snippet}`
    : `The server returned an empty response (HTTP ${response.status}).`;
}

/**
 * Parse a response as JSON, or throw an error a person can act on.
 *
 * Deliberately does not check `response.ok`: a 422 from these routes carries a
 * perfectly good JSON body with the log in it, and callers want to read that
 * rather than be handed a status code.
 *
 * The default type parameter is `any`, matching `Response.json()`, so that
 * this is a drop-in replacement at every call site. Narrowing it would be
 * nicer and would also mean rewriting sixteen callers to prove things the old
 * code never proved either -- a separate change, not a bug fix.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson<T = any>(response: Response): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(describeNonJson(response, body));
  }
}
