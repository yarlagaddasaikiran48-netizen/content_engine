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
 *
 * The lease is held per key **and per purpose**, for two separate reasons.
 * Per key, because the engine may now hold several and one spent project says
 * nothing about another. Per purpose, because Google meters each model
 * separately: exhausting the TTS preview model must not stand the same key
 * down for writing scripts, which is the far cheaper and far more important
 * call. Conflating the two would let a spent voice quota stop the engine
 * writing anything at all — and the voice already has a free fallback in Edge,
 * so it is precisely the one that must not be allowed to block.
 */

import { keyFingerprint } from "@/lib/gemini/keys";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Which meter ran out. Each gets its own lease per key. */
export type QuotaPurpose = "text" | "tts";

export function cooldownLockName(purpose: QuotaPurpose, key: string): string {
  return `gemini-quota:${purpose}:${keyFingerprint(key)}`;
}

export interface KeySurvey {
  /** Keys worth trying right now, in the order given. */
  free: string[];
  /** Seconds until the earliest cooling key frees up; 0 when one is free now. */
  soonest: number;
}

/**
 * Which of these keys is worth asking, and how long until one is.
 *
 * One query for every key rather than one per key: the tick runs on a
 * serverless function with a sixty-second budget that it also has to render
 * and publish inside.
 *
 * Never throws. A cooldown that cannot be read must not be the reason a
 * generation does not happen — the worst case of guessing "free" is one
 * refused request, and the worst case of guessing "blocked" is an engine that
 * has quietly stopped writing.
 */
export async function surveyKeys(
  purpose: QuotaPurpose,
  keys: readonly string[],
): Promise<KeySurvey> {
  if (keys.length === 0) return { free: [], soonest: 0 };

  const names = keys.map((key) => cooldownLockName(purpose, key));

  let held: Map<string, number>;
  try {
    const { data, error } = await supabaseAdmin()
      .from("system_lock")
      .select("name, locked_until")
      .in("name", names);

    if (error) return { free: [...keys], soonest: 0 };

    held = new Map(
      ((data ?? []) as Array<{ name: string; locked_until: string | null }>).flatMap((row) => {
        if (!row.locked_until) return [];
        const remaining = (new Date(row.locked_until).getTime() - Date.now()) / 1_000;
        return remaining > 0 ? [[row.name, Math.ceil(remaining)] as const] : [];
      }),
    );
  } catch {
    return { free: [...keys], soonest: 0 };
  }

  const free = keys.filter((key) => !held.has(cooldownLockName(purpose, key)));
  const soonest = free.length > 0 ? 0 : Math.min(...held.values());

  return { free, soonest };
}

/** Stand this one key down for this purpose. Never throws, for the same reason. */
export async function startQuotaCooldown(
  purpose: QuotaPurpose,
  key: string,
  seconds: number,
): Promise<void> {
  try {
    await supabaseAdmin()
      .from("system_lock")
      .upsert(
        {
          name: cooldownLockName(purpose, key),
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
