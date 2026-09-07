import { describe, expect, it } from "vitest";
import { checkSafety } from "@/lib/safety/profanity";

/** A clean script in the register the prompt asks for. Must never trip a filter. */
const CLEAN_TELUGU = `రాత్రి పదకొండు గంటలు. ఫోన్ చేతిలో ఉంది. మళ్ళీ అదే ప్రొఫైల్ చూస్తున్నావు.
ఒక ఏనుగు ఉండేది. నీళ్ళలో ఒక మొసలి దాని కాలు పట్టుకుంది. వెయ్యి సంవత్సరాలు పోరాడింది.
చివరికి ఒక పువ్వు ఎత్తి పట్టుకుంది. ఆ క్షణంలోనే విష్ణువు వచ్చాడు.`;

describe("Telugu safety filtering", () => {
  it("passes a clean devotional script without false positives", () => {
    const report = checkSafety("Gajendra and the crocodile", CLEAN_TELUGU, "A story about surrender.", "#telugu");
    expect(report.issues).toEqual([]);
    expect(report.safe).toBe(true);
  });

  it("catches Telugu-script profanity", () => {
    // Regression guard: \b does not work on Telugu at all — /\bలంజ\b/ is false
    // even for an exact standalone match — so this cannot be matched the way
    // the English list is.
    const report = checkSafety("వాడు లంజ కొడుకు అని తిట్టాడు.");
    expect(report.safe).toBe(false);
    expect(report.issues.some((i) => i.category === "profanity")).toBe(true);
  });

  it("catches a profane root carrying a Telugu suffix", () => {
    // Telugu is agglutinative: the root keeps its spelling and grows a tail.
    const report = checkSafety("ఆ మొడ్డని చూడు");
    expect(report.safe).toBe(false);
  });

  it("does not fire on a Telugu word that merely starts mid-string", () => {
    expect(checkSafety(CLEAN_TELUGU).safe).toBe(true);
  });

  it("still catches romanised Telugu abuse", () => {
    expect(checkSafety("vaadu lanja koduku").safe).toBe(false);
  });

  it("still catches English profanity after the Telugu lists are added", () => {
    expect(checkSafety("this is bullshit").safe).toBe(false);
  });
});
