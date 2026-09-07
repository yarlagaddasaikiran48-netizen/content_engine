import { describe, expect, it } from "vitest";
import { validateScript } from "@/lib/safety/validate";
import type { AppConfig } from "@/lib/settings/config";
import type { GeneratedScript } from "@/lib/types";

/** Only the fields validateScript reads; the rest never enter this path. */
const cfg = {
  targetSeconds: 30,
  ttsWordsPerMinute: 80,
  wordCountTolerance: 0.15,
} as AppConfig;

// 30s at 80 wpm = 40 words ideal, 34-46 accepted.
const TELUGU_40 = `రాత్రి పదకొండు గంటలు అయ్యింది ఇప్పుడు. ఫోన్ చేతిలోనే ఉంది. మళ్ళీ అదే ప్రొఫైల్ చూస్తున్నావు.
ఒక ఏనుగు ఉండేది. నీళ్ళలో ఒక మొసలి దాని కాలు గట్టిగా పట్టుకుంది. దానికి బలం తక్కువేమీ కాదు.
వెయ్యి సంవత్సరాలు పోరాడింది. లాగింది, కొట్టింది, అరిచింది. ఏమీ జరగలేదు.
చివరికి ఒక పువ్వు ఎత్తి పట్టుకుంది. అంతే. ఆ క్షణంలోనే విష్ణువు వచ్చాడు అక్కడికి.`;

function script(over: Partial<GeneratedScript> = {}): GeneratedScript {
  return {
    title: "The elephant who fought for a thousand years",
    script_body: TELUGU_40,
    seo_description:
      "Gajendra fought the crocodile on his own strength for a thousand years and lost. " +
      "The moment he stopped struggling was the moment he was saved. Bhagavata Purana, Canto 8.",
    hashtags: ["#telugu", "#bhakti", "#puranas", "#gajendra", "#shorts"],
    ...over,
  } as GeneratedScript;
}

describe("validateScript, Telugu narration", () => {
  it("accepts a well-formed Telugu script with an English title", () => {
    const result = validateScript(script(), cfg);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects a script that came back in English", () => {
    const body =
      "You did everything right and it still went to someone else. There was an elephant " +
      "once. A crocodile caught his leg in the water and would not let go of him at all. " +
      "He fought for a thousand years and lost every single time he tried.";
    const result = validateScript(script({ script_body: body }), cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/telugu/i);
  });

  it("rejects romanised Telugu, which the Telugu voice cannot read", () => {
    const body =
      "Neeku telusa, aa enugu veyyi samvatsaralu poradindi kaani emi jaragaledu ala. " +
      "Chivariki oka puvvu etti pattukundi appudu, anthe ika poratam ledu akkada.";
    const result = validateScript(script({ script_body: body }), cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/telugu/i);
  });

  it("rejects a Telugu call to action inside the narration", () => {
    const body = TELUGU_40.replace("అంతే.", "ఈ ఛానెల్ ని సబ్‌స్క్రైబ్ చేయండి.");
    const result = validateScript(script({ script_body: body }), cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/call to action/i);
  });

  it("counts Telugu words against the retuned 80 wpm window", () => {
    // Half the script is far too short for thirty seconds of Telugu speech.
    const short = "ఒక ఏనుగు ఉండేది. నీళ్ళలో ఒక మొసలి దాని కాలు పట్టుకుంది.";
    const result = validateScript(script({ script_body: short }), cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/too short/i);
  });
});
