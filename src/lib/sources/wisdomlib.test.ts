import { describe, expect, it } from "vitest";

import {
  extractChapterText,
  extractTranslator,
  isFrontMatter,
  parseChapterIndex,
  splitReference,
} from "@/lib/sources/wisdomlib";

const INDEX_HTML = `
<ul>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117022.html">Title Page</a>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117023.html">Preface</a>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117024.html">Introduction</a>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117027.html">Canto I - The Curse on Vapu</a>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117031.html">Canto V - Indra&rsquo;s Transformations</a>
  <a href="/hinduism/book/the-other-book/d/doc9.html">Some other book</a>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117027.html">Canto I - The Curse on Vapu</a>
  <a href="/hinduism/book/the-markandeya-purana/d/doc117099.html">Chapter 2 - Index of Content</a>
</ul>`;

const CHAPTER_HTML = `
<html><head><title>x</title></head><body>
<h1 class="h2 pt-2">Canto V - Indra&rsquo;s Transformations</h1>
<p>by Frederick Eden Pargiter | 1904 | 247,181 words | ISBN-10: 8171102237</p>
<script>var junk = "should not appear";</script>
<style>.x { color: red }</style>
<div class="col-12 chapter-content text_921" id="scontent">
  <h2><em>The birds spoke</em>:</h2>
  <p>Thus the fact of her being one wife to five men has been explained&nbsp;to thee.</p>
  <p>Be it heard how Baladeva went to the Sarasvat&#299;.</p>
</div>
<div class="footer">I humbly request your help to keep doing what I do best.</div>
</body></html>`;

describe("parseChapterIndex", () => {
  const links = parseChapterIndex(INDEX_HTML, "/hinduism/book/the-markandeya-purana");

  it("keeps only chapters of the book asked for", () => {
    expect(links.every((l) => l.url.includes("the-markandeya-purana"))).toBe(true);
    expect(links.some((l) => l.label === "Some other book")).toBe(false);
  });

  it("drops front matter", () => {
    expect(links.map((l) => l.label)).not.toContain("Preface");
    expect(links.map((l) => l.label)).not.toContain("Title Page");
    expect(links.map((l) => l.label)).not.toContain("Introduction");
  });

  it("drops front matter that has been given a chapter number", () => {
    // The Linga Purana lists its contents page as "Chapter 2 - Index of
    // Content", which passes a whole-label check and is not a chapter.
    expect(links.map((l) => l.label)).not.toContain("Chapter 2 - Index of Content");
  });

  it("decodes entities in the label", () => {
    expect(links.map((l) => l.label)).toContain("Canto V - Indra’s Transformations");
  });

  it("returns absolute urls", () => {
    expect(links[0].url).toBe(
      "https://www.wisdomlib.org/hinduism/book/the-markandeya-purana/d/doc117027.html",
    );
  });

  it("does not repeat a chapter listed twice on the page", () => {
    expect(links).toHaveLength(2);
  });
});

describe("isFrontMatter", () => {
  it("recognises the parts of a book that are not the book", () => {
    for (const label of [
      "Title Page",
      "Preface",
      "Introduction",
      "Contents",
      "Index",
      "Appendix I",
      "Errata",
      "Additions and Corrections",
      "Bibliography",
      "Abbreviations",
    ]) {
      expect(isFrontMatter(label), label).toBe(true);
    }
  });

  it("leaves real chapters alone", () => {
    expect(isFrontMatter("Canto I - The Curse on Vapu")).toBe(false);
    expect(isFrontMatter("Chapter 12 - The Churning")).toBe(false);
    // "Invocation" is front matter; "The Invocation of Durga" is a chapter.
    expect(isFrontMatter("Invocation")).toBe(true);
    expect(isFrontMatter("Canto III - The Invocation of Durga")).toBe(false);
  });
});

describe("splitReference", () => {
  it("separates the citable reference from the chapter's name", () => {
    expect(splitReference("Canto V - Indra’s Transformations")).toEqual({
      reference: "Canto V",
      title: "Indra’s Transformations",
    });
    expect(splitReference("Chapter 12 - The Churning of the Ocean")).toEqual({
      reference: "Chapter 12",
      title: "The Churning of the Ocean",
    });
  });

  it("falls back to the whole label when there is no separator", () => {
    expect(splitReference("The Story of Dhruva")).toEqual({
      reference: "The Story of Dhruva",
      title: "The Story of Dhruva",
    });
  });

  it("handles an en dash as well as a hyphen", () => {
    expect(splitReference("Canto II – The Birth of the Sparrows")).toEqual({
      reference: "Canto II",
      title: "The Birth of the Sparrows",
    });
  });
});

describe("extractChapterText", () => {
  const text = extractChapterText(CHAPTER_HTML);

  it("returns the chapter body and nothing around it", () => {
    expect(text).toContain("one wife to five men");
    expect(text).toContain("Baladeva went to the Sarasvatī");
    expect(text).not.toContain("humbly request");
    expect(text).not.toContain("ISBN");
  });

  it("drops scripts and styles rather than reading them as prose", () => {
    expect(text).not.toContain("should not appear");
    expect(text).not.toContain("color: red");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(text).toContain("explained to thee");
    expect(text).not.toMatch(/\s{2,}/);
  });
});

describe("extractTranslator", () => {
  it("reads the attribution line the page already carries", () => {
    expect(extractTranslator(CHAPTER_HTML)).toBe("Frederick Eden Pargiter");
  });

  it("returns null when there is no attribution", () => {
    expect(extractTranslator("<html><body><p>nothing here</p></body></html>")).toBe(null);
  });
});
