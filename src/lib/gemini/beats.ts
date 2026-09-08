/**
 * The beat sheet, generated from the configured length.
 *
 * This used to be fixed prose reading "THE PHYSICS OF THIRTY SECONDS" with
 * literal second markers. That was correct only at 30 seconds, and silently
 * wrong everywhere else — the model was told to close at second 26 while the
 * word count asked for a minute of speech.
 *
 * The fractions below describe a retelling: hook, scene, escalation, the turn
 * the episode is famous for, its resolution in the text, and a quiet close.
 * There is deliberately no beat that hands the story to the viewer's own life.
 * That beat used to exist — "this is where the ancient story becomes the
 * viewer's Tuesday" — and it was the modern bridge expressed as timing, so it
 * had to go along with the prompt section that asked for it.
 */

interface Beat {
  /** Fraction of the runtime where this beat starts. */
  from: number;
  /** Fraction where it ends. */
  to: number;
  text: string;
}

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

/**
 * Past this length a single turn cannot hold the middle — the story sags and
 * the viewer leaves. Longer scripts get a second complication instead of a
 * stretched first one.
 */
const SECOND_TURN_THRESHOLD_SECONDS = 45;

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

/** "Second 0-2." or "Second 26-30." — whole seconds, so the model can count. */
function label(beat: Beat, targetSeconds: number): string {
  const from = Math.round(beat.from * targetSeconds);
  const to = Math.round(beat.to * targetSeconds);
  return `Second ${from}-${to}.`;
}

/** Spell small numbers so the heading reads as prose, not as a variable. */
const WORDS: Record<number, string> = {
  20: "TWENTY",
  25: "TWENTY-FIVE",
  30: "THIRTY",
  35: "THIRTY-FIVE",
  40: "FORTY",
  45: "FORTY-FIVE",
  50: "FIFTY",
  60: "SIXTY",
  75: "SEVENTY-FIVE",
  90: "NINETY",
};

/**
 * The whole "physics" section of the master prompt, ready to interpolate.
 */
export function buildBeatSheet(targetSeconds: number): string {
  const heading = WORDS[targetSeconds] ?? String(targetSeconds);
  const lines = beatsFor(targetSeconds)
    .map((beat) => `- ${label(beat, targetSeconds)} ${beat.text}`)
    .join("\n");

  return [
    `## THE PHYSICS OF ${heading} SECONDS`,
    "",
    "You get 1.5 seconds before the thumb moves. That is the whole negotiation.",
    "",
    lines,
    "",
    "Never summarise at the end. Never say \"the lesson is\", never explain what the episode means, and never address the viewer's own life. You are telling them what happened. If the story worked, they already got the rest, and stating it insults them.",
  ].join("\n");
}
