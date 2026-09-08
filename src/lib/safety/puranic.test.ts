import { describe, expect, it } from "vitest";

import { checkSafety } from "@/lib/safety/profanity";

/**
 * The filter was written for a general-purpose channel and then pointed at a
 * corpus whose entire subject is gods killing demons.
 *
 * Measured before the fix, against descriptions written exactly as the master
 * prompt orders them: seven of ten were thrown away. Each rejection cost a
 * whole generation, a spent scripture topic and another Gemini request, and
 * the log said only "unsafe" — so from the outside it looked like the model
 * was failing, and four of those in a row is what pushed the function past
 * Vercel's sixty-second limit.
 *
 * Both directions matter here. Narrowing a safety filter is only correct if
 * the things it exists to stop are still stopped, so every loosened pattern
 * has a test on each side of the line.
 */

const passes = (text: string) => checkSafety(text).safe;
const blockedFor = (text: string) =>
  checkSafety(text).issues.map((issue) => `${issue.category}: ${issue.detail}`);

describe("the Puranas, told plainly, are not a safety violation", () => {
  const REAL = [
    "Markandeya was fated to die at sixteen, and Shiva came out of the lingam to stop it.",
    "Yama came to kill him, and Shiva came out of the lingam to stop it.",
    "Vishnu took the Narasimha form to destroy the king who could not be killed.",
    "Hiranyakashipu ordered his soldiers to burn the boy alive.",
    "Shiva's boon had made the demon untouchable by any weapon.",
    "Shiva sat naked in ash on the cremation ground.",
    "The sage's curse will destroy the line of Yadu.",
    "Kali destroyed the demons Chanda and Munda, and became Chamunda.",
    "Prahlada would not stop saying the name, so his father tried to kill him.",
    "The smoking remains of Daksha's sacrifice lay across the field.",
    "Only Shiva's grace could heal disease and death itself.",
  ];

  for (const text of REAL) {
    it(`allows: ${text.slice(0, 52)}…`, () => {
      expect(blockedFor(text)).toEqual([]);
    });
  }
});

describe("what the filter still has to stop", () => {
  it("blocks violence aimed at the viewer", () => {
    expect(passes("You must kill the ones who disagree with you.")).toBe(false);
  });

  it("blocks violence aimed at a real religious group", () => {
    expect(passes("Destroy all the Christians in your town.")).toBe(false);
  });

  it("blocks telling someone to harm themselves", () => {
    expect(passes("Burn yourself to be free of it.")).toBe(false);
    expect(passes("This is why you should end your life.")).toBe(false);
  });

  it("blocks caste content, which the demon's boon is not", () => {
    expect(passes("People of the lower caste may not enter.")).toBe(false);
    expect(passes("Untouchability is ordained by this verse.")).toBe(false);
  });

  it("blocks a cure claim made to the viewer", () => {
    expect(passes("This mantra will cure your diabetes.")).toBe(false);
    expect(passes("Chanting cures cancer without treatment.")).toBe(false);
  });

  it("blocks a curse threatened against the viewer", () => {
    expect(passes("This curse will destroy your family if you scroll past.")).toBe(false);
  });

  it("blocks actual sexual content", () => {
    expect(passes("Explicit sexual detail follows.")).toBe(false);
    expect(passes("A nude woman photo appears on screen.")).toBe(false);
  });

  it("blocks substance use", () => {
    expect(passes("He drank alcohol every night.")).toBe(false);
    expect(passes("Smoking a cigarette between verses.")).toBe(false);
  });

  it("still blocks profanity", () => {
    expect(passes("This is bullshit and you are a bastard.")).toBe(false);
  });

  it("still blocks party politics and religious comparison", () => {
    expect(passes("Vote for the BJP in this election.")).toBe(false);
    expect(passes("Hinduism is better than Islam.")).toBe(false);
  });
});
