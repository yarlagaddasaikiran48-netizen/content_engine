# Pure Retelling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every script a complete retelling of one Purana episode at sixty seconds, instead of a thirty-second bridge from scripture to the viewer's week.

**Architecture:** Three prompt-layer files and one settings default. `beats.ts` generates the beat sheet from the target length; `master-prompt.ts` interpolates it into the system instruction; `prompt.ts` builds the per-call user message. Nothing downstream changes — the validator, the safety checks and the pipeline are all style-agnostic, which was verified before this plan was written.

**Tech Stack:** TypeScript, Next.js 15, Vitest 3. Tests are colocated `*.test.ts` files and run with `npx vitest run <path>`.

**Spec:** `docs/superpowers/specs/2026-09-08-retelling-voice-corpus-design.md` (Workstream 1)

## Global Constraints

- The narration is Telugu in the Telugu alphabet; title, description and hashtags are English. Never change which field is which language.
- The Telugu register table (గ్రాంథిక vs వ్యావహారిక verb endings), both banned-phrase lists, and all nine HARD RULES stay in the master prompt, unmodified. They are load-bearing and unrelated to the style question.
- `buildBeatSheet(targetSeconds: number): string` and `buildMasterPrompt(targetSeconds: number): string` keep their exact signatures. `systemInstruction(cfg)` calls the latter.
- `tts_words_per_minute` stays at **80** in this plan. It is re-measured only after the Gemini TTS workstream, against the new engine.
- Existing safety tests (`validate.telugu`, `profanity.telugu`, `language`) must keep passing untouched. Run the full suite before every commit.
- No em-dashes or emoji in prompt text that reaches the model as narration instruction; the narration itself already bans them.

---

### Task 1: Narrative beat sheet

`beats.ts` currently encodes a bridge arc: hook, enter the story, one turn, "the line that lands" where the ancient story becomes the viewer's Tuesday, close. The landing beat is the modern bridge expressed as timing, so it has to go even though the file never says "bridge".

**Files:**
- Modify: `src/lib/gemini/beats.ts:26-49` (the `BASE_BEATS` array) and `:57-77` (`beatsFor`)
- Test: `src/lib/gemini/beats.test.ts` (create — this file has no tests today)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `buildBeatSheet(targetSeconds: number): string`, unchanged signature. Task 2 interpolates its return value into the master prompt at the `__BEAT_SHEET__` marker.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gemini/beats.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildBeatSheet } from "@/lib/gemini/beats";

describe("buildBeatSheet", () => {
  it("names the target length in the heading", () => {
    expect(buildBeatSheet(60)).toContain("THE PHYSICS OF SIXTY SECONDS");
    expect(buildBeatSheet(30)).toContain("THE PHYSICS OF THIRTY SECONDS");
  });

  it("opens on a hook and closes quietly", () => {
    // The fractions scale with the target, so at 60s the hook is 0-4, not 0-2.
    expect(buildBeatSheet(60)).toContain("Second 0-4.");
    expect(buildBeatSheet(30)).toContain("Second 0-2.");
    expect(buildBeatSheet(60)).toMatch(/The hook\./);
    expect(buildBeatSheet(60)).toMatch(/Second 54-60\./);
  });

  it("builds a narrative arc, not a bridge to the viewer's life", () => {
    const sheet = buildBeatSheet(60);
    expect(sheet).toContain("The turn.");
    expect(sheet).toContain("The resolution.");
    // The old landing beat asked the model to make the story "the viewer's
    // Tuesday". Retelling has no such beat, and its absence is the point.
    expect(sheet).not.toMatch(/viewer's Tuesday/i);
    expect(sheet).not.toMatch(/becomes the viewer/i);
  });

  it("adds a second complication only past the threshold", () => {
    expect(buildBeatSheet(30)).not.toContain("A second complication.");
    expect(buildBeatSheet(45)).not.toContain("A second complication.");
    expect(buildBeatSheet(60)).toContain("A second complication.");
  });

  it("covers the whole runtime with no gap between beats", () => {
    const sheet = buildBeatSheet(60);
    const bounds = [...sheet.matchAll(/Second (\d+)-(\d+)\./g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(bounds[0][0]).toBe(0);
    expect(bounds[bounds.length - 1][1]).toBe(60);
    for (let i = 1; i < bounds.length; i += 1) {
      expect(bounds[i][0]).toBe(bounds[i - 1][1]);
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/gemini/beats.test.ts`

Expected: the arc test and the second-complication test FAIL. `buildBeatSheet(60)` currently produces "The line that lands. This is where the ancient story becomes the viewer's Tuesday" and has no beat named "The resolution."

- [ ] **Step 3: Replace the beat array**

In `src/lib/gemini/beats.ts`, replace the whole `BASE_BEATS` array with:

```typescript
const BASE_BEATS: Beat[] = [
  {
    from: 0,
    to: 2 / 30,
    text: 'The hook. One line from inside the story that cannot be walked away from. Something already happening, or something already lost. "Death came for him on his sixteenth birthday, exactly as promised" works. "Today we will learn about the Markandeya Purana" is a dead video.',
  },
  {
    from: 2 / 30,
    to: 7 / 30,
    text: "The scene. Who this is, where they are, and what is about to be taken from them. One concrete image, not a description. No \"long ago in ancient India\", no explaining who a deity is.",
  },
  {
    from: 7 / 30,
    to: 15 / 30,
    text: "The escalation. It gets worse, and it costs the character something real. Keep it in scene: what they did, what was said, what it cost.",
  },
  {
    from: 15 / 30,
    to: 22 / 30,
    text: "The turn. The moment this episode is famous for. Everything before this beat exists to make this one land. Tell it plainly and do not rush it.",
  },
  {
    from: 22 / 30,
    to: 27 / 30,
    text: "The resolution. How it ends in the text itself, not how it applies to anyone. If the passage gives a consequence, give the consequence.",
  },
  {
    from: 27 / 30,
    to: 1,
    text: "One quiet closing beat. An image or a plain statement of where it left things. Let it end early rather than pad it.",
  },
];
```

- [ ] **Step 4: Update `beatsFor` for the six-beat arc**

The destructuring in `beatsFor` still names five beats. Replace the function body with:

```typescript
function beatsFor(targetSeconds: number): Beat[] {
  if (targetSeconds <= SECOND_TURN_THRESHOLD_SECONDS) return BASE_BEATS;

  const [hook, scene, escalation, turn, resolution, close] = BASE_BEATS;
  const midpoint = (escalation.from + escalation.to) / 2;

  return [
    hook,
    scene,
    { ...escalation, to: midpoint },
    {
      from: midpoint,
      to: escalation.to,
      text: "A second complication. One escalation cannot hold the middle at this length. Give the character a new problem that grows out of how they answered the first one. Do not restate what already happened.",
    },
    turn,
    resolution,
    close,
  ];
}
```

- [ ] **Step 5: Update the closing instruction**

In `buildBeatSheet`, the final line currently reads:

```typescript
"Never summarise at the end. Never say \"the lesson is\". If the story worked, they already got it, and stating it insults them.",
```

Replace with:

```typescript
"Never summarise at the end. Never say \"the lesson is\", never explain what the episode means, and never address the viewer's own life. You are telling them what happened. If the story worked, they already got the rest, and stating it insults them.",
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/gemini/beats.test.ts`
Expected: PASS, all five.

Then run the whole suite: `npx vitest run`
Expected: PASS, 111 existing tests plus the new ones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gemini/beats.ts src/lib/gemini/beats.test.ts
git commit -m "Rebuild the beat sheet as a story arc, not a bridge"
```

---

### Task 2: The master prompt tells the episode

**Files:**
- Modify: `src/lib/gemini/master-prompt.ts` — the `WHO IS WATCHING` section, `THE TRANSLATION RULE` section, one bullet in `HOW IT MUST SOUND`, and the file's own header comment
- Test: `src/lib/gemini/master-prompt.test.ts` (create)

**Interfaces:**
- Consumes: `buildBeatSheet(targetSeconds)` from Task 1, interpolated at the `__BEAT_SHEET__` marker.
- Produces: `buildMasterPrompt(targetSeconds: number): string`, unchanged signature. `prompt.ts:systemInstruction(cfg)` calls it with `cfg.targetSeconds`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gemini/master-prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildMasterPrompt } from "@/lib/gemini/master-prompt";

const prompt = buildMasterPrompt(60);

describe("buildMasterPrompt", () => {
  it("interpolates the beat sheet", () => {
    expect(prompt).not.toContain("__BEAT_SHEET__");
    expect(prompt).toContain("THE PHYSICS OF SIXTY SECONDS");
  });

  it("asks for the episode itself, not a bridge to the viewer's week", () => {
    expect(prompt).not.toContain("THE TRANSLATION RULE");
    expect(prompt).not.toMatch(/pressure a young Telugu speaker feels this week/);
    expect(prompt).toContain("THE JOB");
  });

  // These are load-bearing and must survive every style change.
  it("keeps the Telugu register table", () => {
    expect(prompt).toContain("వచ్చెను");
    expect(prompt).toContain("వచ్చాడు");
    expect(prompt).toContain("వ్యావహారిక");
  });

  it("keeps every hard rule", () => {
    expect(prompt).toContain("HARD RULES");
    for (let n = 1; n <= 9; n += 1) {
      expect(prompt).toContain(`${n}. `);
    }
    expect(prompt).toMatch(/Use ONLY the passage supplied/);
    expect(prompt).toMatch(/Never invent Sanskrit/);
  });

  it("keeps both banned-phrase lists", () => {
    expect(prompt).toContain("PHRASES THAT ARE BANNED IN THE NARRATION");
    expect(prompt).toContain("BANNED IN THE ENGLISH TITLE AND DESCRIPTION");
    expect(prompt).toContain("అనగనగా ఒక రోజు");
  });

  it("keeps the four output fields and their languages", () => {
    expect(prompt).toContain("script_body");
    expect(prompt).toContain("seo_description");
    expect(prompt).toContain("hashtags");
    expect(prompt).toMatch(/script_body — \*\*TELUGU/);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/gemini/master-prompt.test.ts`
Expected: the second test FAILS — the prompt still contains `THE TRANSLATION RULE` and has no `THE JOB` section. The other tests should already pass, which is the point: they are the regression net for everything that must not move.

- [ ] **Step 3: Reframe who is watching**

Replace the last paragraph of `## WHO IS WATCHING`:

```
They are not looking for religion. They are looking for relief. The Purana is how you give it to them without it sounding like advice.
```

with:

```
They grew up on these stories from a grandmother and have not heard one told properly since. They are not looking for advice, and they are not looking for a lesson. They want the story — told well enough that they stay for all of it, and told completely enough that they could tell it to someone else tomorrow.
```

- [ ] **Step 4: Replace THE TRANSLATION RULE with THE JOB**

Replace this entire section:

```
## THE TRANSLATION RULE

Every script does exactly one job: take one specific pressure a young Telugu speaker feels this week, and show that a text two thousand years old already knew about it.

The bridge must be honest. If the passage genuinely speaks to being overlooked at work, say so. If it does not, write the timeless version instead. A forced modern parallel is worse than none — the audience can smell it, and it makes the scripture look like a prop.

Never name the era as a category, in either language. Show the modern situation in concrete detail instead.
```

with:

```
## THE JOB

Every script tells one episode from one Purana, and tells it completely enough that somebody who has never heard it understands what happened, who it happened to, and how it ended.

The episode is the content. You are not extracting a lesson from it, not building a bridge to the viewer's own life, and not using it as an example of anything. If the passage is famous for a single moment — a boy holding a pillar, an elephant lifting a lotus, a king offering his own head for the third step — that moment is the destination, and everything before it exists to make it land.

Tell it as a story, in scene. What someone did, what was said, what it cost. Not what it represents.

Never explain the meaning at the end, and never turn to the viewer. No "this teaches us", no second-person address about their life. The story does that work or it does not get done.

Never name the era as a category, in either language.
```

- [ ] **Step 5: Fix the second-person bullet**

Under `## HOW IT MUST SOUND`, replace:

```
- Second person is welcome. నువ్వు is the most powerful word available. Use the familiar form, not the formal మీరు — this is one person talking to one person, not an address to an audience.
```

with:

```
- Tell it in the third person and the past tense, the way a story is told. Address the viewer as నువ్వు only inside dialogue, when a character in the episode is speaking to another character. Never turn out of the story to speak to the person watching.
```

- [ ] **Step 6: Update the file's header comment**

The design notes at the top of the file still describe the old intent. Replace the bullet reading:

```
 * - It is written as *constraints and physics*, not as a template. Templates
 *   produce identical-sounding scripts, which is exactly what the duplicate
 *   detection then rejects.
```

with:

```
 * - It is written as *constraints and physics*, not as a template. Templates
 *   produce identical-sounding scripts, which is exactly what the duplicate
 *   detection then rejects.
 * - The script is a retelling. It used to bridge the passage to a pressure the
 *   viewer felt that week; it no longer does, because the episode is the
 *   content. THE JOB says so, the beat sheet has no landing beat, and HOW IT
 *   MUST SOUND keeps the narration inside the story. All three have to agree,
 *   or the model splits the difference and produces a lecture with a hook.
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/gemini/master-prompt.test.ts`
Expected: PASS, all six.

Then: `npx vitest run`
Expected: everything passes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/gemini/master-prompt.ts src/lib/gemini/master-prompt.test.ts
git commit -m "Tell the episode, instead of translating it into the viewer's week"
```

---

### Task 3: Stop the per-call prompt reintroducing the bridge

`prompt.ts` hands the model the day's panchang under `TODAY'S CONTEXT` and tells it to "decide the emotional angle" from it. Left alone, that is an open invitation to write the bridge the master prompt just stopped asking for — the two would contradict each other, and a contradicted model splits the difference.

**Files:**
- Modify: `src/lib/gemini/prompt.ts:46-48` (the `TODAY'S CONTEXT` section)
- Test: `src/lib/gemini/prompt.test.ts` (create)

**Interfaces:**
- Consumes: `buildMasterPrompt` from Task 2 via `systemInstruction(cfg)`.
- Produces: `buildPrompt(input: PromptInput): string`, unchanged signature and unchanged `PromptInput` shape.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gemini/prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildPrompt } from "@/lib/gemini/prompt";
import type { AppConfig } from "@/lib/settings/config";
import type { HookContext, Topic } from "@/lib/types";

const cfg = {
  targetSeconds: 60,
  ttsWordsPerMinute: 80,
  wordCountTolerance: 0.15,
} as AppConfig;

const topic = {
  topic_key: "purana:markandeya:markandeya",
  source: "purana",
  scripture: "Markandeya Purana",
  reference: "Chapters 1-2",
  title: "When death came for Markandeya",
  theme: "devotion outlasting a fixed span",
  summary: "A boy promised only sixteen years clings to the Shiva linga as Yama's noose falls.",
  citation_url: "https://www.wisdomlib.org/hinduism/book/markandeya-purana",
} as Topic;

const hook = {
  summary: "Today is Maha Shivaratri.",
} as HookContext;

describe("buildPrompt", () => {
  it("passes the occasion without inviting a bridge to the viewer's week", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], cfg });
    expect(prompt).toContain("Maha Shivaratri");
    expect(prompt).not.toMatch(/decide the emotional angle/i);
    expect(prompt).toMatch(/which part of the episode to dwell on/i);
  });

  it("still carries the passage and the word window", () => {
    const prompt = buildPrompt({ topic, hook, recentTitles: [], cfg });
    expect(prompt).toContain("Markandeya Purana");
    expect(prompt).toContain("Chapters 1-2");
    // 60s at 80 wpm is 80 words, +/- 15% => 68 to 92.
    expect(prompt).toContain("between 68 and 92 words");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/gemini/prompt.test.ts`
Expected: the first test FAILS — the prompt still says "Use this to decide the emotional angle."

- [ ] **Step 3: Rewrite the context section**

In `src/lib/gemini/prompt.ts`, replace:

```typescript
  sections.push(`TODAY'S CONTEXT
${hook.summary}
Use this to decide the emotional angle. Do not force it. If the occasion does not fit the passage, ignore it and write the timeless version.`);
```

with:

```typescript
  sections.push(`TODAY'S CONTEXT
${hook.summary}
Use this only to choose which part of the episode to dwell on — a Shiva festival is a reason to linger on a Shiva episode's central moment, nothing more. Never mention the occasion, the date or the season in the script, and never use it to connect the story to the viewer's own week. If it does not fit the passage, ignore it completely.`);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/gemini/prompt.test.ts`
Expected: PASS, both.

Then: `npx vitest run`
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gemini/prompt.ts src/lib/gemini/prompt.test.ts
git commit -m "Let the occasion choose emphasis, not an angle on the viewer's life"
```

---

### Task 4: Sixty seconds

**Files:**
- Modify: `src/lib/settings/catalogue.ts:188` (the `target_seconds` fallback)
- Test: `src/lib/settings/catalogue.test.ts` (exists — add a case)

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports. `wordWindow(cfg)` in `src/lib/settings/config.ts` derives the window from `targetSeconds` and `ttsWordsPerMinute`; at 60s and 80 wpm that is 80 words, 68 to 92.

**Operator gotcha, and it must be verified rather than assumed:** settings precedence is *row, then environment, then this fallback*. If an `app_settings` row for `target_seconds` already holds `"30"`, changing this fallback does nothing at all. After deploying, open Settings and confirm "Video length (seconds)" reads 60; if it reads 30, set it there and save.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/settings/catalogue.test.ts`:

```typescript
it("defaults to a sixty second video", () => {
  expect(settingDef("target_seconds").fallback).toBe("60");
});

it("allows sixty within its own bounds", () => {
  const def = settingDef("target_seconds");
  expect(def.min).toBeLessThanOrEqual(60);
  expect(def.max).toBeGreaterThanOrEqual(60);
});
```

Make sure `settingDef` is imported at the top of that file; add it to the existing import from `@/lib/settings/catalogue` if it is not already there.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/settings/catalogue.test.ts`
Expected: the first new test FAILS with `expected "30" to be "60"`. The second should already pass — min is 20 and max is 90.

- [ ] **Step 3: Change the fallback**

In `src/lib/settings/catalogue.ts`, in the `target_seconds` entry, change:

```typescript
    fallback: "30",
```

to:

```typescript
    fallback: "60",
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/settings/catalogue.test.ts`
Expected: PASS.

Then the whole suite plus a typecheck:

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/catalogue.ts src/lib/settings/catalogue.test.ts
git commit -m "Default to a minute, now that the beats carry one"
```

---

### Task 5: Read one script end to end

Prompt changes cannot be verified by unit tests. The tests prove the instruction says what we meant; only a generated script proves the model heard it.

**Files:** none modified. This task produces a judgement, not a diff.

- [ ] **Step 1: Generate a batch**

Deploy, then trigger generation from the dashboard as normal.

- [ ] **Step 2: Read three scripts against these questions**

1. Does it tell one episode from start to finish, or does it still stop partway to draw a lesson?
2. Does the first line work alone, without the second to explain it?
3. Does it ever turn to the viewer — "నువ్వు" addressed outward, the era named, a modern situation described?
4. Is it 68 to 92 words, and does the generated audio land inside the duration gate?
5. Would somebody who had never heard this episode be able to retell it?

- [ ] **Step 3: Report before continuing**

If question 3 finds the bridge surviving anywhere, the three files from Tasks 1 to 3 disagree somewhere and the disagreement has to be found before the voice workstream starts. Do not paper over it with a stronger adjective in the prompt.

---

## What this plan deliberately does not do

- Anything to the voice. That is the Gemini TTS plan, and `tts_words_per_minute` stays at 80 until then.
- Anything to the corpus. The rotation will still exhaust the thin Puranas; that is the corpus plan.
- Anything to publishing. Vertical and under three minutes is already a Short.
