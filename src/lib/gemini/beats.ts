/**
 * The beat sheet, generated from the configured length.
 *
 * This used to be fixed prose reading "THE PHYSICS OF THIRTY SECONDS" with
 * literal second markers. That was correct only at 30 seconds, and silently
 * wrong everywhere else — the model was told to close at second 26 while the
 * word count asked for a minute of speech.
 *
 * The fractions below reproduce the proven 30-second sheet exactly (0-2, 2-8,
 * 8-20, 20-26, 26-30), so nothing about the tuned default changes; they just
 * follow the target now instead of being hardcoded to it.
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
    text: 'The hook. Name a feeling or a situation, never a topic. "You did everything right and it still went to someone else" works. "Today we will learn about karma yoga from the Vishnu Purana" is a dead video.',
  },
  {
    from: 2 / 30,
    to: 8 / 30,
    text: "Drop straight into the story. One concrete image. A person, a place, a problem. No setup, no \"long ago in ancient India\", no explaining who a deity is.",
  },
  {
    from: 8 / 30,
    to: 20 / 30,
    text: "The story turns. Something happens that the viewer did not expect, and it costs the character something real.",
  },
  {
    from: 20 / 30,
    to: 26 / 30,
    text: "The line that lands. This is where the ancient story becomes the viewer's Tuesday. Say it once. Do not explain it.",
  },
  {
    from: 26 / 30,
    to: 1,
    text: "One short closing beat. Quiet. Let it end early rather than pad it.",
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

  const [hook, enter, turn, landing, close] = BASE_BEATS;
  const midpoint = (turn.from + turn.to) / 2;

  return [
    hook,
    enter,
    { ...turn, to: midpoint },
    {
      from: midpoint,
      to: turn.to,
      text: "A second complication. The first turn is not enough at this length — give the character a new problem that grows out of how they answered the first one. Do not restate what already happened.",
    },
    landing,
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
    "Never summarise at the end. Never say \"the lesson is\". If the story worked, they already got it, and stating it insults them.",
  ].join("\n");
}
