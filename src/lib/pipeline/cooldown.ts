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
 * The lease is held per **model**, per **key** and per **purpose**, because
 * Google meters all three separately and each distinction buys real capacity:
 *
 *  - Per model, because gemini-3.6-flash allows 20 requests a day while
 *    gemini-3.1-flash-lite allows 500 on the very same key. Exhausting the
 *    good model says nothing at all about the cheap one.
 *  - Per key, because a key from another Google account is another project
 *    and another whole budget.
 *  - Per purpose, because the TTS preview model allows 10 a day where text
 *    allows 20. Conflating them would let a spent voice quota stop the engine
 *    writing scripts — the expensive thing to lose, and the one without a free
 *    fallback underneath it. Voice already falls through to Edge.
 */

import { keyFingerprint } from "@/lib/gemini/keys";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Which meter ran out. Each gets its own lease per model and key. */
export type QuotaPurpose = "text" | "tts";

/** One thing the engine can spend: this model, on this key. */
export interface GeminiTarget {
  key: string;
  model: string;
}

/**
 * The model is written in plain: it is not a secret, and a lock row naming
 * `gemini-quota:text:gemini-3.6-flash:a1b2c3d4` tells the operator exactly
 * what ran out when they read the table from a phone. The key never is.
 */
export function cooldownLockName(purpose: QuotaPurpose, target: GeminiTarget): string {
  return `gemini-quota:${purpose}:${target.model}:${keyFingerprint(target.key)}`;
}

export interface TargetSurvey {
  /** Targets worth trying right now, in the order given. */
  free: GeminiTarget[];
  /** Seconds until the earliest cooling target frees up; 0 when one is free now. */
  soonest: number;
}

/**
 * Which of these model/key pairs is worth asking, and how long until one is.
 *
 * One query for every target rather than one per target: the tick runs on a
 * serverless function with a sixty-second budget that it also has to render
 * and publish inside.
 *
 * Never throws. A cooldown that cannot be read must not be the reason a
 * generation does not happen — the worst case of guessing "free" is one
 * refused request, and the worst case of guessing "blocked" is an engine that
 * has quietly stopped writing.
 */
export async function surveyTargets(
  purpose: QuotaPurpose,
  targets: readonly GeminiTarget[],
): Promise<TargetSurvey> {
  if (targets.length === 0) return { free: [], soonest: 0 };

  const names = targets.map((target) => cooldownLockName(purpose, target));

  let held: Map<string, number>;
  try {
    const { data, error } = await supabaseAdmin()
      .from("system_lock")
      .select("name, locked_until")
      .in("name", names);

    if (error) return { free: [...targets], soonest: 0 };

    held = new Map(
      ((data ?? []) as Array<{ name: string; locked_until: string | null }>).flatMap((row) => {
        if (!row.locked_until) return [];
        const remaining = (new Date(row.locked_until).getTime() - Date.now()) / 1_000;
        return remaining > 0 ? [[row.name, Math.ceil(remaining)] as const] : [];
      }),
    );
  } catch {
    return { free: [...targets], soonest: 0 };
  }

  const free = targets.filter((target) => !held.has(cooldownLockName(purpose, target)));
  const soonest = free.length > 0 ? 0 : Math.min(...held.values());

  return { free: [...free], soonest };
}

/** Stand this one model, on this one key, down. Never throws, for the same reason. */
export async function startQuotaCooldown(
  purpose: QuotaPurpose,
  target: GeminiTarget,
  seconds: number,
): Promise<void> {
  try {
    await supabaseAdmin()
      .from("system_lock")
      .upsert(
        {
          name: cooldownLockName(purpose, target),
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
