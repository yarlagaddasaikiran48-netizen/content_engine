import { describe, expect, it } from "vitest";
import {
  dueSlot,
  orderedSlots,
  prettyTime,
  projectSchedule,
  slotMinutes,
  zonedDateKey,
} from "@/lib/schedule/slots";

const IST = "Asia/Kolkata";
const SLOTS = ["00:00", "04:00"];

/** IST is UTC+5:30, so 18:30 UTC on the 6th is 00:00 IST on the 7th. */
const istMidnight = new Date("2026-09-06T18:30:00Z");

describe("slotMinutes", () => {
  it("converts HH:MM to minutes past midnight", () => {
    expect(slotMinutes("00:00")).toBe(0);
    expect(slotMinutes("04:00")).toBe(240);
    expect(slotMinutes("23:59")).toBe(1439);
  });

  it("rejects anything that is not HH:MM", () => {
    for (const bad of ["8am", "24:00", "4:00", "", "99:99"]) {
      expect(() => slotMinutes(bad), bad).toThrow();
    }
  });
});

describe("orderedSlots", () => {
  it("sorts through the day regardless of the order they were entered", () => {
    expect(orderedSlots(["04:00", "00:00"])).toEqual(["00:00", "04:00"]);
  });

  it("removes duplicates so one slot cannot publish twice", () => {
    expect(orderedSlots(["04:00", "04:00", "00:00"])).toEqual(["00:00", "04:00"]);
  });

  it("drops malformed entries rather than throwing", () => {
    expect(orderedSlots(["00:00", "nope", "04:00"])).toEqual(["00:00", "04:00"]);
  });
});

describe("dueSlot", () => {
  it("finds the slot at its exact minute", () => {
    expect(dueSlot(istMidnight, SLOTS, IST)).toBe("00:00");
  });

  it("still claims the slot for a late tick inside the window", () => {
    const fortyMinutesLate = new Date(istMidnight.getTime() + 40 * 60_000);
    expect(dueSlot(fortyMinutesLate, SLOTS, IST)).toBe("00:00");
  });

  it("gives up once the window has passed, rather than posting hours late", () => {
    const twoHoursLate = new Date(istMidnight.getTime() + 120 * 60_000);
    expect(dueSlot(twoHoursLate, SLOTS, IST)).toBeNull();
  });

  it("returns null between slots", () => {
    const twoAm = new Date(istMidnight.getTime() + 120 * 60_000);
    expect(dueSlot(twoAm, SLOTS, IST)).toBeNull();
  });

  it("picks up the 4am slot at its own time", () => {
    const fourAm = new Date(istMidnight.getTime() + 4 * 60 * 60_000);
    expect(dueSlot(fourAm, SLOTS, IST)).toBe("04:00");
  });

  it("uses the operator's timezone, not the server's", () => {
    // The same instant is 00:00 IST but 18:30 UTC — only one has a slot due.
    expect(dueSlot(istMidnight, SLOTS, IST)).toBe("00:00");
    expect(dueSlot(istMidnight, SLOTS, "UTC")).toBeNull();
  });
});

describe("zonedDateKey", () => {
  it("rolls the date at local midnight, not UTC midnight", () => {
    expect(zonedDateKey(istMidnight, IST)).toBe("2026-09-07");
    expect(zonedDateKey(istMidnight, "UTC")).toBe("2026-09-06");
  });
});

describe("projectSchedule", () => {
  // 02:00 IST: midnight has gone, 4am is still ahead.
  const earlyMorning = new Date("2026-09-06T20:30:00Z");

  it("puts the first script in the next slot still ahead today", () => {
    const [first] = projectSchedule(1, earlyMorning, SLOTS, IST);
    expect(first.slot).toBe("04:00");
    expect(first.dayOffset).toBe(0);
    expect(first.label).toBe("Today 4:00 AM");
  });

  it("rolls a backlog across following days, oldest first", () => {
    const plan = projectSchedule(5, earlyMorning, SLOTS, IST);
    expect(plan.map((p) => p.label)).toEqual([
      "Today 4:00 AM",
      "Tomorrow 12:00 AM",
      "Tomorrow 4:00 AM",
      "In 2 days, 12:00 AM",
      "In 2 days, 4:00 AM",
    ]);
  });

  it("treats a slot that has already passed today as tomorrow's", () => {
    // 23:30 IST. The next midnight is half an hour away but belongs to the
    // next calendar day, and the label must say so rather than imply today.
    const lateNight = new Date("2026-09-06T18:00:00Z");
    expect(projectSchedule(1, lateNight, SLOTS, IST)[0].label).toBe("Tomorrow 12:00 AM");
  });

  it("moves to tomorrow when every slot today has passed", () => {
    const noon = new Date("2026-09-07T06:30:00Z"); // 12:00 IST, both slots gone
    const [first] = projectSchedule(1, noon, SLOTS, IST);
    expect(first.label).toBe("Tomorrow 12:00 AM");
  });

  it("scales with however many slots are configured", () => {
    const plan = projectSchedule(4, earlyMorning, ["00:00", "04:00", "12:00"], IST);
    expect(plan.map((p) => p.slot)).toEqual(["04:00", "12:00", "00:00", "04:00"]);
    expect(plan.map((p) => p.dayOffset)).toEqual([0, 0, 1, 1]);
  });

  it("returns nothing when there is nothing queued", () => {
    expect(projectSchedule(0, earlyMorning, SLOTS, IST)).toEqual([]);
  });

  it("returns nothing rather than crashing when no slots are configured", () => {
    expect(projectSchedule(3, earlyMorning, [], IST)).toEqual([]);
  });
});

describe("prettyTime", () => {
  it("renders midnight and noon the way a person reads them", () => {
    expect(prettyTime("00:00")).toBe("12:00 AM");
    expect(prettyTime("12:00")).toBe("12:00 PM");
    expect(prettyTime("04:00")).toBe("4:00 AM");
    expect(prettyTime("16:30")).toBe("4:30 PM");
  });
});
