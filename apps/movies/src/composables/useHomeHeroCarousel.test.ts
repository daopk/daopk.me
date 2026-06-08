import { describe, expect, it } from "vitest";

import { normalizeHomeHeroIndex } from "./useHomeHeroCarousel";

describe("useHomeHeroCarousel", () => {
  it("normalizes active indexes into the carousel range", () => {
    expect(normalizeHomeHeroIndex(0, 6)).toBe(0);
    expect(normalizeHomeHeroIndex(6, 6)).toBe(0);
    expect(normalizeHomeHeroIndex(7, 6)).toBe(1);
    expect(normalizeHomeHeroIndex(-1, 6)).toBe(5);
    expect(normalizeHomeHeroIndex(3, 0)).toBe(0);
  });
});
