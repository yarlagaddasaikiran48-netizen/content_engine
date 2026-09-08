/**
 * A stand-down period after Gemini refuses for quota.
 *
 * The scheduler ticks every five minutes and asks for a script whenever the
 * day's count is short. That is correct while scripts are being written and
 * catastrophic once the quota is gone: nothing is ever inserted, so the count
 * never rises, so the next tick asks again — 288 refused requests a day
 * against a free-tier budget of twenty, which guarantees the budget stays at
 * zero even after the window rolls over.
 *
 * The fix is for a refusal to be remembered. The lease lives in system_lock,
 * the table the tick already uses to stop itself overlapping: same shape, same
 * self-expiry, and no migration to run from a phone.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const LOCK_NAME = "gemini-quota";

/**
 * Seconds left before Gemini is worth asking again; 0 when it is free now.
 *
 * Never throws. A cooldown that cannot be read must not be the reason a
 * generation does not happen — the worst case of guessing "free" is one
 * refused request, and the worst case of guessing "blocked" is an engine that
 * has quietly stopped writing.
 */
export async function quotaCooldownRemaining(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("system_lock")
      .select("locked_until")
      .eq("name", LOCK_NAME)
      .maybeSingle();

    if (error || !data?.locked_until) return 0;

    const remaining = (new Date(data.locked_until).getTime() - Date.now()) / 1_000;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  } catch {
    return 0;
  }
}

/** Stand down for this many seconds. Never throws, for the same reason. */
export async function startQuotaCooldown(seconds: number): Promise<void> {
  try {
    await supabaseAdmin()
      .from("system_lock")
      .upsert(
        {
          name: LOCK_NAME,
          locked_until: new Date(Date.now() + seconds * 1_000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "name" },
      );
  } catch {
    /* a cooldown that cannot be written costs requests, not correctness */
  }
}

/** Readable for a log line or a dashboard sheet: "42 minutes", "50 seconds". */
export function describeCooldown(seconds: number): string {
  if (seconds >= 5_400) return `${Math.round(seconds / 3_600)} hours`;
  if (seconds >= 90) return `${Math.round(seconds / 60)} minutes`;
  return `${seconds} seconds`;
}
