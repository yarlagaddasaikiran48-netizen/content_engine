import { describe, expect, it } from "vitest";

import { describeNonJson, readJson } from "@/lib/http";

/**
 * The bug these tests exist for: the operator pressed Generate, the function
 * overran Vercel's sixty seconds, and the browser reported
 *
 *     Unexpected token 'A', "An error o"... is not valid JSON
 *
 * which says nothing about a timeout and throws away the whole generation log.
 * Every test here is a shape of non-JSON that must arrive as a sentence a
 * person can act on.
 */

function response(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

/** The exact bytes Vercel returned when this was reproduced against production. */
const VERCEL_TIMEOUT_BODY =
  "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n\nbom1::hg8ph-1788880756010-6d30f9deaeec\n";

describe("readJson", () => {
  it("parses a normal JSON body", async () => {
    const body = await readJson(response('{"ok":true,"videos":[]}'));
    expect(body).toEqual({ ok: true, videos: [] });
  });

  it("parses an error body rather than throwing on the status", async () => {
    // A 422 from these routes carries the generation log. Callers need it.
    const body = await readJson(
      response('{"ok":false,"error":"nope","log":["a","b"]}', { status: 422 }),
    );
    expect(body.log).toEqual(["a", "b"]);
  });

  it("explains a function timeout instead of complaining about the letter A", async () => {
    const call = readJson(
      response(VERCEL_TIMEOUT_BODY, {
        status: 504,
        headers: { "x-vercel-error": "FUNCTION_INVOCATION_TIMEOUT" },
      }),
    );

    await expect(call).rejects.toThrow(/ran out of time/i);
    await expect(call).rejects.not.toThrow(/Unexpected token/);
  });

  it("recognises the timeout from the body alone when the header is missing", async () => {
    // Some edge paths omit x-vercel-error; the code is still in the text.
    await expect(readJson(response(VERCEL_TIMEOUT_BODY, { status: 504 }))).rejects.toThrow(
      /ran out of time/i,
    );
  });
});

describe("describeNonJson", () => {
  it("names a crash", () => {
    const message = describeNonJson(
      response("", { status: 500, headers: { "x-vercel-error": "FUNCTION_INVOCATION_FAILED" } }),
      "",
    );
    expect(message).toMatch(/crashed/i);
  });

  it("reports an unknown platform code rather than swallowing it", () => {
    const message = describeNonJson(
      response("", { status: 500, headers: { "x-vercel-error": "SOMETHING_NEW" } }),
      "",
    );
    expect(message).toContain("SOMETHING_NEW");
  });

  it("recognises a login wall, which is what deployment protection looks like", () => {
    const message = describeNonJson(
      response("", { status: 401 }),
      "<!DOCTYPE html><html><body>Sign in to Vercel</body></html>",
    );
    expect(message).toMatch(/web page instead of data/i);
    expect(message).toMatch(/deployment protection/i);
  });

  it("quotes a short plain-text body so the cause is visible", () => {
    const message = describeNonJson(response("", { status: 502 }), "upstream connect error");
    expect(message).toContain("upstream connect error");
    expect(message).toContain("502");
  });

  it("says so when the body is empty", () => {
    // 200 rather than 204: the Response constructor forbids a body on a 204,
    // and the case being tested is a body that is present but blank.
    expect(describeNonJson(response("", { status: 200 }), "   ")).toMatch(/empty response/i);
  });

  it("does not quote an entire error page back at the operator", () => {
    const message = describeNonJson(response("", { status: 500 }), "x".repeat(5_000));
    expect(message.length).toBeLessThan(300);
  });
});
