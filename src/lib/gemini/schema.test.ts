import { describe, expect, it } from "vitest";

import { responseSchema } from "@/lib/gemini/generate";
import { wordWindow } from "@/lib/settings/config";
import type { AppConfig } from "@/lib/settings/config";

/**
 * The schema used to hardcode "62-96 words" while the validator enforced
 * whatever wordWindow() computed. At the shipped defaults that is 68-92, so
 * the model was being told ninety-four words was fine and then having
 * ninety-four words thrown away — a whole generation and another spent topic,
 * every time it landed in the gap, with nothing in the log to explain it.
 *
 * These tests make the two agree by construction.
 */

const cfg = (targetSeconds: number, wpm = 80, tolerance = 0.15) =>
  ({ targetSeconds, ttsWordsPerMinute: wpm, wordCountTolerance: tolerance }) as AppConfig;

function bodyDescription(config: AppConfig): string {
  const schema = responseSchema(config) as {
    properties: { script_body: { description: string } };
  };
  return schema.properties.script_body.description;
}

describe("responseSchema", () => {
  it("states the same word range the validator will enforce", () => {
    const config = cfg(60);
    const { min, max } = wordWindow(config);

    expect(bodyDescription(config)).toContain(`${min}-${max}`);
  });

  it("moves with the configured length", () => {
    expect(bodyDescription(cfg(30))).not.toEqual(bodyDescription(cfg(60)));
  });

  it("moves with the tolerance", () => {
    expect(bodyDescription(cfg(60, 80, 0.05))).not.toEqual(
      bodyDescription(cfg(60, 80, 0.4)),
    );
  });

  it("no longer carries the hardcoded range", () => {
    for (const seconds of [20, 30, 45, 60, 90]) {
      expect(bodyDescription(cfg(seconds))).not.toContain("62-96");
    }
  });

  it("still requires all seven fields the pipeline persists", () => {
    const schema = responseSchema(cfg(60)) as { required: string[] };
    expect(schema.required).toEqual([
      "title",
      "script_body",
      "seo_description",
      "hashtags",
      "deity",
      "scene_prompt",
      "tone",
    ]);
  });
});
