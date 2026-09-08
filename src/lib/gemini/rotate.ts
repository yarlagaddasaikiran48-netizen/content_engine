/**
 * Spend the next model, on the next key, that still has quota.
 *
 * The engine used to hold one Gemini key and one model. When Google refused it
 * the day was over: the tick stood down for an hour, woke, was refused again,
 * and the channel went quiet until midnight Pacific.
 *
 * Google meters every model separately, and the free-tier allowances differ by
 * more than an order of magnitude. Read off this project's own quota page:
 *
 *   gemini-3.6-flash        20 requests/day
 *   gemini-3.8-flash        20      "
 *   gemini-3.7-flash        20      "
 *   gemini-3.5-flash        20      "
 *   gemini-3-flash          20      "
 *   gemini-3.1-flash-lite  500      "
 *   gemini-3.5-flash-lite  500      "
 *
 * So one key is not a budget of twenty; it is a budget of roughly eleven
 * hundred, if the engine is willing to come down the quality ladder as the
 * better models run out. That is what this walk does, and it is worth far more
 * than a second API key — though keys multiply it again, since each one is a
 * separate Google project with the whole ladder to itself.
 *
 * Models are the outer loop and keys the inner one, deliberately. The chain is
 * written best-first, so this exhausts every key's copy of the good model
 * before any key drops to a lesser one. Quality degrades only when there is no
 * remaining way to avoid it.
 *
 * Three rules keep the walk from becoming thrashing:
 *
 *  1. Only a *quota* refusal or an *overload* moves on. A blocked prompt or a
 *     malformed response will fail identically everywhere, so continuing would
 *     spend a good budget proving what the first target already established.
 *     An overload is different in kind: "this model is currently experiencing
 *     high demand" describes one model at one moment, and says nothing about
 *     the next one down the chain -- so it moves on, and stands the busy model
 *     down for ten minutes rather than the hour a spent budget earns.
 *  2. A model Google does not recognise is skipped, not fatal. The chain names
 *     models this code cannot verify exist; one wrong name must cost the run
 *     one request, not the whole run.
 *  3. Every refusal is remembered before the next target is tried, or the
 *     following tick starts at the same spent target and pays again.
 */

import { keyFingerprint } from "@/lib/gemini/keys";
import {
  describeCooldown,
  startQuotaCooldown,
  surveyTargets,
  type GeminiTarget,
  type QuotaPurpose,
} from "@/lib/pipeline/cooldown";
import { isOverloadedError, isQuotaError, quotaRetrySeconds } from "@/lib/pipeline/fatal";

/** A model name Google refuses is worth re-testing tomorrow, not this hour. */
const UNKNOWN_MODEL_COOLDOWN_SECONDS = 86_400;

/**
 * A busy model is worth re-testing in minutes, not hours.
 *
 * Long enough that the next tick does not walk straight back into the same
 * overload, short enough that a two-minute spike does not cost the rest of the
 * day on the best model in the chain.
 */
const OVERLOADED_COOLDOWN_SECONDS = 600;

export class NoGeminiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoGeminiKeyError";
  }
}

/**
 * Raised when every model on every key is standing down. Carries
 * RESOURCE_EXHAUSTED in its message on purpose, so the callers that already
 * classify errors — isQuotaError, isFatalGenerationError — keep recognising it
 * without having to know that rotation exists.
 */
export class AllTargetsExhaustedError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "AllTargetsExhaustedError";
  }
}

export interface RotateOptions {
  /** Lines describing what happened, appended in place. */
  log?: string[];
}

/** Does this read as "Google has never heard of that model"? */
export function isUnknownModelError(message: string): boolean {
  return (
    /no longer available/i.test(message) ||
    /is not found|not found for API version/i.test(message) ||
    (/NOT_FOUND/.test(message) && /model/i.test(message))
  );
}

/**
 * Every model/key pair, best model first, in the order they should be spent.
 *
 * Exported so the Queue page can say how many ways there are left to write a
 * script, rather than only whether there are none.
 */
export function buildTargets(
  keys: readonly string[],
  models: readonly string[],
): GeminiTarget[] {
  const targets: GeminiTarget[] = [];
  for (const model of models) {
    for (const key of keys) targets.push({ key, model });
  }
  return targets;
}

function describeTarget(target: GeminiTarget, keys: readonly string[]): string {
  const which = keys.length > 1 ? ` on key ${keys.indexOf(target.key) + 1} (${keyFingerprint(target.key)})` : "";
  return `${target.model}${which}`;
}

/**
 * Run `attempt` against each model/key pair that is not cooling.
 *
 * @throws NoGeminiKeyError        when no key, or no model, is configured.
 * @throws AllTargetsExhaustedError when every pair is spent.
 * @throws whatever `attempt` threw, when the failure was not about quota.
 */
export async function withGeminiTarget<T>(
  purpose: QuotaPurpose,
  keys: readonly string[],
  models: readonly string[],
  attempt: (target: GeminiTarget) => Promise<T>,
  options: RotateOptions = {},
): Promise<T> {
  if (keys.length === 0) {
    throw new NoGeminiKeyError(
      "No Gemini API key is set. Open Settings and add one under Connections.",
    );
  }
  if (models.length === 0) {
    throw new NoGeminiKeyError(
      `No Gemini ${purpose === "tts" ? "voice" : ""} model is set. Open Settings and add one under Connections.`.replace(
        /\s+/g,
        " ",
      ),
    );
  }

  const targets = buildTargets(keys, models);
  const { free, soonest } = await surveyTargets(purpose, targets);
  const meter = purpose === "tts" ? "voice" : "script";

  if (free.length === 0) {
    throw new AllTargetsExhaustedError(
      `RESOURCE_EXHAUSTED: every Gemini model and key is out of ${meter} quota ` +
        `(${models.length} model(s) x ${keys.length} key(s)). ` +
        `The first frees up in ${describeCooldown(soonest)}.`,
      soonest,
    );
  }

  let lastQuotaError: unknown;
  /** An overload is not a spent budget, so it is reported in its own words. */
  let lastTransientError: unknown;
  let unknownModels = 0;

  for (const target of free) {
    try {
      return await attempt(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // A name Google does not know. Not fatal — the chain deliberately names
      // models this code cannot verify — but not worth retrying today either.
      if (isUnknownModelError(message)) {
        unknownModels += 1;
        await startQuotaCooldown(purpose, target, UNKNOWN_MODEL_COOLDOWN_SECONDS);
        options.log?.push(
          `  gemini: ${describeTarget(target, keys)} is not a model Google recognises; skipping it for a day.`,
        );
        continue;
      }

      // An overloaded model is the exception to the rule below. "This model is
      // currently experiencing high demand" is a statement about one model at
      // one moment, not about the key, the prompt or the budget -- so the next
      // model in the chain is genuinely likely to answer. Treating it as fatal
      // meant a busy gemini-3.6-flash stopped the engine writing while six
      // other models sat idle with full quota.
      if (isOverloadedError(message)) {
        await startQuotaCooldown(purpose, target, OVERLOADED_COOLDOWN_SECONDS);
        options.log?.push(
          `  gemini: ${describeTarget(target, keys)} is busy right now; trying the next model and standing it down for ${describeCooldown(OVERLOADED_COOLDOWN_SECONDS)}.`,
        );
        lastTransientError = error;
        continue;
      }

      // Anything else that is not a spent quota will fail the same way on the
      // next target. Leave now rather than burn a good budget proving it.
      if (!isQuotaError(message)) throw error;

      lastQuotaError = error;
      const wait = quotaRetrySeconds(message);
      await startQuotaCooldown(purpose, target, wait);
      options.log?.push(
        `  gemini: ${describeTarget(target, keys)} is out of ${meter} quota; standing it down for ${describeCooldown(wait)}.`,
      );
    }
  }

  // Every name in the chain was rejected as unknown. That is a configuration
  // mistake, not a spent budget, and calling it RESOURCE_EXHAUSTED would send
  // the operator to the quota page to fix a typo in Settings.
  if (unknownModels === free.length) {
    throw new NoGeminiKeyError(
      `Google does not recognise any of the ${meter} models configured ` +
        `(${models.join(", ")}). Correct them in Settings.`,
    );
  }

  // Every model was busy rather than spent. Saying RESOURCE_EXHAUSTED here
  // would send the operator to the quota page to look at budgets that are
  // fine, and would stand the engine down for an hour over a passing spike.
  if (!lastQuotaError && lastTransientError) {
    throw lastTransientError instanceof Error
      ? lastTransientError
      : new Error(String(lastTransientError));
  }

  throw lastQuotaError instanceof Error
    ? lastQuotaError
    : new AllTargetsExhaustedError(
        `RESOURCE_EXHAUSTED: every Gemini model and key was refused for ${meter}.`,
        3_600,
      );
}
