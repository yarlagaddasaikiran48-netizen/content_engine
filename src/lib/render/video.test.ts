import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  assTime,
  buildAss,
  buildCues,
  gradientSource,
  kenBurns,
  CAPTION_FONT,
  CAPTION_MARGIN_V,
  CAPTION_SIZE,
  FPS,
  HEIGHT,
  WIDTH,
} from "@/lib/render/video";

const TELUGU = "మార్కండేయుడు పదహారేళ్ళకే చనిపోవాలని రాసి ఉంది. యముడు వచ్చాడు.";

describe("assTime", () => {
  it("writes h:mm:ss.cc, which is the only shape libass accepts", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(5.5)).toBe("0:00:05.50");
    expect(assTime(61.25)).toBe("0:01:01.25");
  });

  it("never rolls centiseconds up into a second that is not there", () => {
    // 9.999 rounds to 100cs, which would read as :09.100 — a time later than
    // the cue that follows it, and libass drops the line without a word.
    expect(assTime(9.999)).toBe("0:00:09.99");
  });

  it("clamps a negative to zero rather than emitting a negative timestamp", () => {
    expect(assTime(-3)).toBe("0:00:00.00");
  });
});

describe("buildAss", () => {
  const cues = buildCues(TELUGU, 30);
  const ass = buildAss({ cues });

  it("declares the real frame size, so the font size means pixels", () => {
    expect(ass).toContain(`PlayResX: ${WIDTH}`);
    expect(ass).toContain(`PlayResY: ${HEIGHT}`);
    expect(ass).toContain(`,${CAPTION_SIZE},`);
    expect(ass).toContain(`,${CAPTION_MARGIN_V},1`);
  });

  it("fades every line, which is the whole reason for leaving SRT", () => {
    const dialogue = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
    expect(dialogue.length).toBe(cues.length);
    expect(dialogue.every((line) => line.includes("\\fad(140,140)"))).toBe(true);
  });

  it("keeps the Telugu intact", () => {
    expect(ass).toContain("యముడు");
  });

  it("strips braces, which would open an override block mid-sentence", () => {
    const out = buildAss({ cues: [{ start: 0, end: 1, text: "a {\\b1}bold trick" }] });
    const line = out.split("\n").find((l) => l.startsWith("Dialogue:"))!;
    // The fade we put there survives; the one the text tried to smuggle in does not.
    expect(line).toContain("\\fad(140,140)");
    expect(line).not.toContain("{\\b1}");
  });

  it("keeps every cue on one line, since a stray newline ends the event", () => {
    const out = buildAss({ cues: [{ start: 0, end: 1, text: "two\nlines" }] });
    expect(out.split("\n").filter((l) => l.startsWith("Dialogue:"))).toHaveLength(1);
  });
});

describe("gradientSource", () => {
  it("gives each god its own palette, which is all there is without artwork", () => {
    // One purple wash sat behind every video ever made, so Shiva in the snow
    // and Hanuman carrying the mountain came out the same colour.
    expect(gradientSource("shiva", 60)).not.toBe(gradientSource("devi", 60));
    expect(gradientSource("yama", 60)).not.toBe(gradientSource("surya", 60));
  });

  it("falls back to the original wash for anything unrecognised", () => {
    expect(gradientSource("nonsense", 60)).toBe(gradientSource("general", 60));
  });

  it("builds a filter FFmpeg can parse", () => {
    const source = gradientSource("shiva", 60);
    expect(source).toContain(`size=${WIDTH}x${HEIGHT}`);
    expect(source).toMatch(/c0=0x[0-9a-f]{6}:c1=0x[0-9a-f]{6}:c2=0x[0-9a-f]{6}:c3=0x[0-9a-f]{6}/);
    expect(source).toContain("duration=60.00");
  });
});

describe("kenBurns", () => {
  it("drives zoom from the frame number, not an accumulator", () => {
    // The old move accumulated (zoom+0.0006 each frame), which quantises the
    // crop to whole source pixels and stutters. A function of `on` cannot.
    const filter = kenBurns(60);
    expect(filter).toMatch(/z='[\d.]+\+\([-\d.]+\)\*\(on\/\d+\)'/);
    expect(filter).not.toContain("zoom+");
  });

  it("oversamples before the crop, which is what removes the step", () => {
    expect(kenBurns(60)).toContain(`scale=${WIDTH * 2}:${HEIGHT * 2}`);
    expect(kenBurns(60)).toContain("flags=lanczos");
  });

  it("outputs the Shorts frame at the right rate", () => {
    expect(kenBurns(60)).toContain(`s=${WIDTH}x${HEIGHT}:fps=${FPS}`);
  });

  it("survives a duration too short to have two frames", () => {
    // last = frames - 1 is a divisor; at 0 seconds that would be a division by
    // zero baked into the filter string, and FFmpeg would fail at runtime.
    expect(kenBurns(0)).not.toContain("/0)");
    expect(kenBurns(0.01)).not.toContain("/0)");
  });

  it("does not move identically every time", () => {
    const moves = new Set(Array.from({ length: 40 }, () => kenBurns(60)));
    expect(moves.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The real thing. Skipped where FFmpeg is not installed, which is most CI.
// ---------------------------------------------------------------------------

function has(tool: string): boolean {
  try {
    execFileSync(tool, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ffmpeg = has("ffmpeg") && has("ffprobe");
const work = ffmpeg ? mkdtempSync(join(tmpdir(), "render-test-")) : "";

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

describe.skipIf(!ffmpeg)("the filter chain FFmpeg is actually given", () => {
  it("renders a video, with the captions burnt in", () => {
    // Everything above tests the strings. This tests that FFmpeg accepts them,
    // which is the half that has historically broken — an unescaped colon, a
    // filter that moved, an expression that parses but divides by zero.
    const duration = 3;
    writeFileSync(
      join(work, "captions.ass"),
      buildAss({
        cues: buildCues(TELUGU, duration),
        footer: "Shiva Purana · Rudra Samhita",
        endCard: { text: "సబ్‌స్క్రైబ్ చేయండి", from: duration - 2, to: duration },
      }),
      "utf8",
    );

    const output = join(work, "out.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi",
        "-i", `testsrc2=size=${WIDTH}x${HEIGHT}:rate=1:duration=1`,
        "-f", "lavfi",
        "-i", `sine=frequency=220:duration=${duration}`,
        "-filter_complex",
        `[0:v]${kenBurns(duration)},` +
          "eq=brightness=-0.06:saturation=1.12:contrast=1.04," +
          "subtitles=captions.ass,vignette=PI/5,noise=alls=4:allf=t," +
          `fade=t=in:st=0:d=0.5,fade=t=out:st=${duration - 0.5}:d=0.5,format=yuv420p[v]`,
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-c:a", "aac", "-t", String(duration),
        output,
      ],
      { cwd: work, stdio: "pipe" },
    );

    expect(existsSync(output)).toBe(true);

    const probe = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        output,
      ],
      { encoding: "utf8" },
    ).trim();

    expect(probe).toBe(`${WIDTH},${HEIGHT}`);
  }, 120_000);
});
