import { fail, messageOf, ok } from "@/lib/api";
import { maskedSettings, writeSettings } from "@/lib/settings/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings
 *
 * Returns the masked catalogue: enough for the form to render, never enough to
 * read a credential back out. A secret comes back as
 * `{ value: null, isSet: true, updatedAt }`.
 */
export async function GET() {
  try {
    return ok({ settings: await maskedSettings() });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}

/**
 * POST /api/settings
 *
 * Body: `{ updates: { [key]: string } }`. Partial by design — the form sends
 * only what changed, so a blank secret field means "leave it alone" rather
 * than "erase it". An explicit empty string is what clears a value.
 *
 * Unknown keys are rejected by writeSettings before anything is written.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { updates?: unknown };
    const updates = body.updates;

    if (typeof updates !== "object" || updates === null || Array.isArray(updates)) {
      return fail("Expected an object of setting keys to values.", 400);
    }

    const entries = Object.entries(updates as Record<string, unknown>);
    if (entries.length === 0) return fail("No settings supplied.", 400);
    if (entries.some(([, value]) => typeof value !== "string")) {
      return fail("Every setting value must be a string.", 400);
    }

    await writeSettings(Object.fromEntries(entries) as Record<string, string>);
    return ok({ saved: entries.length });
  } catch (error) {
    return fail(messageOf(error), 400);
  }
}
