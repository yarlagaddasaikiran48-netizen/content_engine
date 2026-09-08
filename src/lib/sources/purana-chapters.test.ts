import { describe, expect, it } from "vitest";

import { PURANA_BY_KEY } from "@/lib/sources/mahapuranas";
import {
  buildChapterRow,
  CHAPTER_WEIGHT,
  chapterSummary,
  chapterTopicKey,
  isUsableChapter,
} from "@/lib/sources/purana-chapters";
import { CORPUS } from "@/lib/sources/puranas";

const markandeya = PURANA_BY_KEY.get("markandeya")!;
const link = {
  url: "https://www.wisdomlib.org/hinduism/book/the-markandeya-purana/d/doc117031.html",
  label: "Canto V - Indra’s Transformations",
};

describe("chapterTopicKey", () => {
  it("is built from the document id, so it survives a re-seed", () => {
    expect(chapterTopicKey("markandeya", link.url)).toBe("purana:markandeya:ch117031");
  });

  it("does not change when the chapter is renamed or moved", () => {
    const sameDoc = "https://www.wisdomlib.org/hinduism/book/the-markandeya-purana/d/doc117031.html";
    expect(chapterTopicKey("markandeya", sameDoc)).toBe(chapterTopicKey("markandeya", link.url));
  });

  it("refuses a url it cannot key", () => {
    expect(() => chapterTopicKey("markandeya", "https://example.com/x")).toThrow(/chapter url/i);
  });
});

describe("chapterSummary", () => {
  it("returns short text unchanged", () => {
    expect(chapterSummary("A short opening.")).toBe("A short opening.");
  });

  it("cuts at the end of a sentence when one ends late enough in the window", () => {
    const text = `${"a".repeat(140)}. ${"b".repeat(300)}`;
    const summary = chapterSummary(text, 200);
    expect(summary.endsWith(".")).toBe(true);
    expect(summary.endsWith("…")).toBe(false);
    expect(summary).toHaveLength(141);
  });

  it("ellipsis-truncates when no sentence ends late enough", () => {
    const summary = chapterSummary("x".repeat(900), 200);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(201);
  });
});

describe("isUsableChapter", () => {
  it("rejects a stub and accepts a real chapter", () => {
    expect(isUsableChapter("too short")).toBe(false);
    expect(isUsableChapter("a".repeat(400))).toBe(true);
  });
});

describe("buildChapterRow", () => {
  const row = buildChapterRow(markandeya, link, {
    text: "The Birds explain the second question. Draupadi was the wife of the five Pandavas, because they were partial incarnations of Indra.",
    translator: "Frederick Eden Pargiter",
  });

  it("names the scripture exactly as the rotation looks it up", () => {
    expect(row.scripture).toBe(markandeya.name);
  });

  it("splits the label into a citable reference and a title", () => {
    expect(row.reference).toBe("Canto V");
    expect(row.title).toBe("Indra’s Transformations");
  });

  it("cites the chapter itself rather than the book", () => {
    expect(row.citation_url).toBe(link.url);
    expect(row.citation_url).toContain("/d/doc117031.html");
  });

  it("carries the real translated text, with attribution", () => {
    expect(row.translation).toContain("Draupadi was the wife");
    expect(row.translator).toBe("Frederick Eden Pargiter");
  });

  it("sits below every curated entry so the famous episodes lead", () => {
    const curatedWeights = CORPUS.map((entry) => entry.weight ?? 100);
    expect(CHAPTER_WEIGHT).toBeLessThan(Math.min(...curatedWeights));
    expect(row.weight).toBe(CHAPTER_WEIGHT);
  });
});
