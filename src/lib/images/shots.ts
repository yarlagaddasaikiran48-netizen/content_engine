/**
 * Turning one episode into a list of pictures.
 *
 * The script already carries a `scene_prompt` — one sentence describing the
 * single image the episode wants. That was written for a renderer that showed
 * one background, and it is not enough for a renderer that shows twelve: a
 * Short that holds one picture for forty-five seconds is a different format
 * wearing the same aspect ratio.
 *
 * So the narration is read once more, at render time, and broken into shots.
 * Render time rather than write time on purpose — six scripts out of seven are
 * rejected on sight, and planning shots for a script nobody approved spends
 * the day's text quota on a video that will never exist.
 *
 * Everything here is pure. The call that spends a request lives in
 * lib/images/generate.ts, so the prompt shape and the coercion below can be
 * tested without a key.
 */

/**
 * Appended to every shot in a video, and the reason twelve images look like
 * one film rather than twelve.
 *
 * Consistency is what separates a channel from a slideshow, and it comes from
 * the tail being identical rather than from any one prompt being good. The
 * register is named against the failure it prevents: image models drift
 * towards illustration and cartoon for mythological subjects unless told
 * otherwise, and a cartoon god is the one thing this channel cannot ship.
 */
export const STYLE_ANCHOR =
  "cinematic film still, photorealistic CGI render, warm temple light, " +
  "rich gold ornament and silk, shallow depth of field, volumetric god rays, " +
  "reverent and serious, vertical 9:16 composition";

/** Guardrails repeated on every image, because one drifting shot ruins the run. */
export const NEGATIVE_ANCHOR =
  "not a cartoon, not anime, not comic art, not chibi, not clipart, " +
  "no text, no watermark, no signature, no modern clothing";

export interface ShotListInput {
  /** The Telugu narration, which is what the shots have to follow. */
  scriptBody: string;
  /** The figure the episode centres on, in English. */
  deity: string | null;
  /** The single-image prompt the script already carries, used as the anchor. */
  scenePrompt: string | null;
  scripture: string | null;
  reference: string | null;
  /** How many shots to ask for. */
  count: number;
}

/**
 * The instruction for the shot-list call.
 *
 * Written as a brief to a storyboard artist rather than as a schema
 * description, because the failure it has to prevent is not malformed output —
 * the response schema handles that — but twelve near-identical prompts. A
 * model asked for "twelve images of Vishnu" returns twelve portraits of
 * Vishnu; a model asked to walk the story returns the elephant, the lake, the
 * crocodile, the lotus lifted, the discus thrown.
 */
export function buildShotListPrompt(input: ShotListInput): string {
  const source = [input.scripture, input.reference].filter(Boolean).join(" ") || "a Purana";
  const anchor = (input.scenePrompt ?? "").trim();

  return [
    `You are the storyboard artist for a Telugu devotional YouTube Short.`,
    ``,
    `The narration below is ${input.count} shots long. Write one image prompt per shot, in ENGLISH, in the order the story tells them.`,
    ``,
    `THE EPISODE: ${source}${input.deity ? `, centred on ${input.deity}` : ""}.`,
    anchor ? `THE MOMENT IT TURNS ON: ${anchor}` : ``,
    ``,
    `THE NARRATION (Telugu):`,
    input.scriptBody.trim(),
    ``,
    `RULES`,
    ``,
    `1. Walk the story. Shot one is where it opens, the last shot is where it ends. Do not return ${input.count} portraits of the same figure in the same pose — return the scene changing: the wide establishing view, the face at the moment of the turn, the hands, the object, the consequence.`,
    `2. One sentence each. Name who is in frame, what they are doing, where, and what the light is doing. Concrete and physical.`,
    `3. Keep the same figure recognisably the same person across every shot — the same skin colour, the same crown, the same ornament. Describe them the same way each time rather than assuming continuity.`,
    `4. Never describe text, letters, numerals or captions in the image.`,
    `5. Never describe a cute, comic or cartoon version of a god. This is the register of a film.`,
    `6. No violence in detail, no blood, no nudity. Reverent throughout.`,
    `7. Do not include style words like "cinematic" or "photorealistic" — those are added afterwards, and repeating them wastes the sentence.`,
    ``,
    `Return exactly ${input.count} prompts.`,
  ]
    .filter((line) => line !== ``)
    .join("\n");
}

/**
 * Force whatever came back into exactly `count` usable prompts.
 *
 * A short list is padded from the anchor and a long one is cut. Neither is
 * worth failing a render over: the images are decoration over a narration that
 * is already correct, and a video with three good shots repeated is a video,
 * where a thrown error is a row back on the queue.
 */
export function normaliseShots(raw: unknown, count: number, anchor: string): string[] {
  const wanted = Math.max(1, Math.floor(count));
  const cleaned = (Array.isArray(raw) ? raw : [])
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    // A one-word "prompt" is the model failing to answer, not a terse shot.
    .filter((entry) => entry.split(/\s+/).length >= 4);

  if (cleaned.length === 0) {
    const fallback = anchor.trim() || "A reverent devotional scene in a temple interior";
    return Array.from({ length: wanted }, () => fallback);
  }

  const out = cleaned.slice(0, wanted);
  // Repeat from the start rather than the end: the opening shot is the one
  // most likely to be a wide establishing view, which survives being seen twice.
  for (let i = 0; out.length < wanted; i++) out.push(cleaned[i % cleaned.length]);
  return out;
}

/** One shot's sentence plus the two anchors, in the order the model reads them. */
export function decorateShot(shot: string, deity: string | null): string {
  const who = deity?.trim() ? `${deity.trim()}. ` : "";
  return `${who}${shot.trim()}. ${STYLE_ANCHOR}. ${NEGATIVE_ANCHOR}.`;
}
