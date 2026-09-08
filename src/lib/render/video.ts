/**
 * How a Short is put together: the caption cues, the caption file, and the move.
 *
 * Split out of scripts/render-and-publish.ts so it can be tested. That script
 * calls main() on import and needs Supabase, FFmpeg and a network before it
 * will do anything at all, which meant the part of the render that decides how
 * the video actually looks was the one part nothing could check.
 */

/** The Shorts frame, and the rate everything is timed against. */
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;

/**
 * Split narration into short caption cues.
 *
 * Shorts are watched muted more often than not, so the captions carry the
 * script. Three to five words per cue is the sweet spot: long enough to read
 * in one glance, short enough to stay in rhythm with the voice.
 */
export function buildCues(script: string, totalSeconds: number): Array<{
  start: number;
  end: number;
  text: string;
}> {
  const words = script.split(/\s+/).filter(Boolean);
  const groups: string[][] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    const endsClause = /[.!?,;:]$/.test(word);
    if (current.length >= 5 || (endsClause && current.length >= 3)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    // Avoid a lonely one-word final cue.
    if (current.length === 1 && groups.length > 0) groups[groups.length - 1].push(...current);
    else groups.push(current);
  }

  // Weight each cue by character count so long phrases hold the screen longer.
  const weights = groups.map((group) => group.join(" ").length);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;

  let elapsed = 0;
  return groups.map((group, index) => {
    const share = (weights[index] / totalWeight) * totalSeconds;
    const start = elapsed;
    elapsed += share;
    return {
      start,
      end: Math.min(elapsed, totalSeconds),
      text: group.join(" "),
    };
  });
}
/** ASS wants h:mm:ss.cc — centiseconds, one leading hour digit. */
export function assTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.min(Math.round((clamped - Math.floor(clamped)) * 100), 99);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(cs)}`;
}

/**
 * Captions as ASS rather than SRT.
 *
 * SRT has no way to say "fade", so every cue appeared and vanished on a single
 * frame. Six or seven hard cuts a second is the cheapest-looking thing in the
 * whole video, and captions are exactly where the eye is. ASS carries a
 * per-line fade tag, and emitting it costs nothing because the cues are built
 * here anyway.
 *
 * PlayResX/Y are declared so the font size means what it says. Left alone,
 * libass assumes a 384x288 canvas and scales by the ratio to the real frame —
 * which is how a "FontSize=17" was ever legible at 1920 tall, by accident, and
 * would have changed meaning the moment the frame size did.
 */
export function buildAss(cues: Array<{ start: number; end: number; text: string }>): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour," +
      " BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle," +
      " BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Colours are &H<AA><BB><GG><RR>, and the alpha is inverted: 00 is opaque.
    // A heavy outline and a real shadow are what keep white text readable over
    // artwork, now that the artwork is no longer blurred into a wash.
    `Style: Default,${CAPTION_FONT},${CAPTION_SIZE},&H00FFFFFF,&H00FFFFFF,&H00000000,` +
      `&H64000000,1,0,0,0,100,100,0,0,1,5,3,2,90,90,${CAPTION_MARGIN_V},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = cues.map((cue) => {
    // Commas separate ASS fields and braces open an override block, so neither
    // may survive from the narration into the line.
    const text = cue.text.replace(/[{}]/g, "").replace(/\r?\n/g, " ");
    return (
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,` +
      `{\\fad(140,140)}${text}`
    );
  });

  return `${header}\n${events.join("\n")}\n`;
}
/**
 * Caption look. Sized in real frame pixels, because buildAss declares PlayRes.
 *
 * 76 of 1920 is roughly the size a Short's captions want to be: big enough to
 * read at arm's length on a phone held in daylight, small enough that a
 * five-word cue still fits one line inside the margins.
 *
 * MarginV keeps them clear of the bottom of the frame, where the player's own
 * chrome — title, channel, buttons — sits over the video on both the Shorts
 * shelf and the watch page.
 */
/**
 * The caption font, and it must be one with Telugu glyphs.
 *
 * This said "DejaVu Sans" — the font every Linux box has — and DejaVu covers
 * Latin, Greek, Cyrillic, Arabic and a good deal more, but no Indic script at
 * all. The narration is Telugu. On the Ubuntu runner, where DejaVu is the
 * default and nothing else is installed, libass had no glyph for a single
 * character of it and would have burnt in a line of empty boxes.
 *
 * It never showed up locally because Windows quietly falls back to a system
 * Telugu face, so the render looked perfect on the machine where it was
 * checked and would have been broken on the machine where it runs.
 *
 * Noto Sans Telugu is the font the workflow now installs. `assertFontPresent`
 * in the render script refuses to render without it, because tofu is not the
 * kind of failure you want to discover on the channel.
 */
export const CAPTION_FONT = "Noto Sans Telugu";
export const CAPTION_SIZE = 76;
export const CAPTION_MARGIN_V = 420;

/**
 * The Ken Burns move: a slow push across a still, in a direction chosen per
 * video.
 *
 * The old move was `zoompan=z='min(zoom+0.0006,1.15)'` over an image scaled to
 * 1.2x, and two things were wrong with it. It accumulated the zoom frame by
 * frame, which quantises the crop window to whole source pixels and shows up
 * as a visible stutter every few frames — the most amateur-looking thing in
 * the render. And it always pushed dead centre, so every video moved
 * identically.
 *
 * This scales to twice the output size first, so one frame of movement is two
 * source pixels rather than a fraction of one and the step disappears; drives
 * the zoom as a straight function of the output frame number rather than an
 * accumulator, so the rate is constant by construction; and offsets the centre
 * over the run in a direction picked per render, so one episode drifts up and
 * left while the next pushes down and right.
 *
 * Random rather than derived from the video id: the point is only that two in
 * a row do not move the same way.
 */
export function kenBurns(duration: number): string {
  const frames = Math.max(2, Math.ceil(duration * FPS));
  const last = frames - 1;
  const pick = <T,>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

  // A push in and a pull out both read as deliberate; alternating stops a feed
  // of these from feeling like one long shot.
  const zoomIn = Math.random() < 0.65;
  const zoomFrom = zoomIn ? 1.0 : 1.12;
  const zoomTo = zoomIn ? 1.12 : 1.0;

  // Enough drift to be felt, not enough to be read as a pan: at 3% of the
  // frame over a minute the eye registers movement without tracking it.
  const drift = 0.03;
  const dirX = pick([-1, 0, 1]);
  const dirY = dirX === 0 ? pick([-1, 1]) : pick([-1, 0, 1]);

  const progress = `(on/${last})`;
  const z = `${zoomFrom.toFixed(2)}+(${(zoomTo - zoomFrom).toFixed(4)})*${progress}`;
  // zoompan's x and y are the top-left of the crop window in source pixels, so
  // centring is (iw - iw/zoom)/2 and the drift rides on top of that.
  const x = `(iw-iw/zoom)/2+(iw*${drift})*(${progress}-0.5)*${dirX}`;
  const y = `(ih-ih/zoom)/2+(ih*${drift})*(${progress}-0.5)*${dirY}`;

  return (
    `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${WIDTH * 2}:${HEIGHT * 2},` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`
  );
}
