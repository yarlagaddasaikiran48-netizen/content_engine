import { describe, expect, it } from "vitest";

import {
  planSequence,
  sequenceFilter,
  sequenceInputs,
  shotCountFor,
} from "@/lib/render/sequence";

/**
 * The arithmetic here is the only thing standing between a correct video and
 * one that ends on a freeze frame. FFmpeg does not complain when the segment
 * length and the crossfade offsets disagree with the total — it renders
 * something, and the something is wrong in a way that only shows up on
 * playback.
 */
describe("planSequence", () => {
  it("solves segment length so the chain lands exactly on the narration", () => {
    for (const [count, total] of [
      [2, 10],
      [5, 11.3],
      [12, 47.2],
      [16, 60],
    ] as const) {
      const plan = planSequence(count, total);
      const chained = plan.count * plan.segment - (plan.count - 1) * plan.crossfade;
      expect(chained).toBeCloseTo(total, 6);
    }
  });

  it("starts each dissolve one segment-minus-crossfade after the last", () => {
    const plan = planSequence(4, 20);
    expect(plan.offsets).toHaveLength(3);
    for (let k = 0; k < plan.offsets.length; k++) {
      expect(plan.offsets[k]).toBeCloseTo((k + 1) * (plan.segment - plan.crossfade), 6);
    }
  });

  it("leaves the last dissolve enough room to finish inside the video", () => {
    const plan = planSequence(12, 47.2);
    const lastEnds = plan.offsets[plan.offsets.length - 1] + plan.crossfade;
    expect(lastEnds).toBeLessThanOrEqual(47.2);
  });

  it("shortens the dissolve rather than let it swallow the shot", () => {
    // Sixteen images over twenty seconds is 1.25s each; a 0.6s dissolve there
    // is half the shot, and xfade reads past the end of its input.
    const plan = planSequence(16, 20, 0.6);
    expect(plan.crossfade).toBeLessThan(0.6);
    expect(plan.crossfade).toBeLessThanOrEqual(plan.segment / 3);
  });

  it("treats a single still as the whole video with no dissolve", () => {
    const plan = planSequence(1, 42.7);
    expect(plan).toMatchObject({ count: 1, segment: 42.7, crossfade: 0 });
    expect(plan.offsets).toEqual([]);
  });
});

describe("shotCountFor", () => {
  it("asks for about one shot per configured interval", () => {
    expect(shotCountFor(45, 3, 16)).toBe(15);
    expect(shotCountFor(24, 2, 16)).toBe(12);
  });

  it("never exceeds the ceiling, so one video cannot spend the day's quota", () => {
    expect(shotCountFor(600, 3, 16)).toBe(16);
  });

  it("never returns zero, because zero stills is not a video", () => {
    expect(shotCountFor(0, 3, 16)).toBe(1);
    expect(shotCountFor(Number.NaN, 3, 16)).toBe(1);
    expect(shotCountFor(1, 30, 16)).toBe(1);
  });
});

describe("sequenceFilter", () => {
  it("labels one branch per still and chains them into [seq]", () => {
    const plan = planSequence(3, 12);
    const filter = sequenceFilter(plan, ["MOVE0", "MOVE1", "MOVE2"]);

    expect(filter).toContain("[0:v]MOVE0");
    expect(filter).toContain("[1:v]MOVE1");
    expect(filter).toContain("[2:v]MOVE2");
    expect(filter).toContain("[seq]");
    // Two joins for three stills, and only the last one writes [seq].
    expect(filter.match(/xfade/g)).toHaveLength(2);
    expect(filter.match(/\[seq\]/g)).toHaveLength(1);
  });

  it("trims every branch, because a looped still is an infinite stream", () => {
    const plan = planSequence(2, 8);
    const filter = sequenceFilter(plan, ["A", "B"]);
    expect(filter.match(/trim=duration=/g)).toHaveLength(2);
    expect(filter).toContain("setpts=PTS-STARTPTS");
  });

  it("passes a single still straight through", () => {
    const filter = sequenceFilter(planSequence(1, 30), ["ONLY"]);
    expect(filter).toContain("[0:v]ONLY");
    expect(filter).not.toContain("xfade");
    expect(filter).toContain("[seq]");
  });

  it("refuses a move list that does not match the plan", () => {
    expect(() => sequenceFilter(planSequence(3, 12), ["A", "B"])).toThrow(/2 moves for 3/);
  });
});

describe("sequenceInputs", () => {
  it("loops and time-limits every still", () => {
    const args = sequenceInputs(["a.png", "b.png"], 2.5);
    expect(args).toEqual([
      "-loop", "1", "-t", "2.500", "-i", "a.png",
      "-loop", "1", "-t", "2.500", "-i", "b.png",
    ]);
  });
});
