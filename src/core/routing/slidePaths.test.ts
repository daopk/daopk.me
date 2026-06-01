import { describe, expect, it } from "vitest";

import {
  deckDirectoryFromSlug,
  deckPathFromSlug,
  isSlideDeckPath,
  normalizeSlideDeckSlug,
  parseSlideDeckPath,
  SlideDeckPathError,
} from "./slidePaths";

describe("slide deck paths", () => {
  it("normalizes titles to a single safe slug segment", () => {
    expect(normalizeSlideDeckSlug("  Product / Roadmap 2026! ")).toBe("product-roadmap-2026");
    expect(deckDirectoryFromSlug("../Escape")).toBe("/home/slides/escape");
    expect(deckPathFromSlug("../Escape")).toBe("/home/slides/escape/slides.md");
  });

  it("rejects slugs without letters or numbers", () => {
    expect(() => normalizeSlideDeckSlug("///")).toThrow(SlideDeckPathError);
  });

  it("detects only canonical slide deck files", () => {
    expect(isSlideDeckPath("/home/slides/product-roadmap/slides.md")).toBe(true);
    expect(isSlideDeckPath("/home/slides/product-roadmap/notes.md")).toBe(false);
    expect(isSlideDeckPath("/home/slides/product-roadmap/nested/slides.md")).toBe(false);
    expect(isSlideDeckPath("/home/notes/slides.md")).toBe(false);
  });

  it("parses canonical deck paths", () => {
    expect(parseSlideDeckPath("/home/slides/product-roadmap/slides.md")).toEqual({
      slug: "product-roadmap",
      directoryPath: "/home/slides/product-roadmap",
      filePath: "/home/slides/product-roadmap/slides.md",
    });
  });
});
