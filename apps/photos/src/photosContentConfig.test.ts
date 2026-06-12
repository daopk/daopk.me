import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  return import("./photosContentConfig");
}

describe("photosContentConfig", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("builds Photos public API URLs from the canonical same-origin _api path", async () => {
    const {
      PHOTO_THUMB_WIDTH,
      PHOTOS_CONTENT_BASE,
      photoThumbUrl,
      photosContentUrl,
      photosIndexUrl,
    } = await loadConfig();

    expect(PHOTOS_CONTENT_BASE).toBe("/_api/public/photos");
    expect(photosIndexUrl()).toBe("/_api/public/photos/index.json");
    expect(photoThumbUrl("2026/sunset.jpg", PHOTO_THUMB_WIDTH)).toBe(
      "/_api/public/photos/2026/sunset.jpg?w=400",
    );
    expect(photosContentUrl("/public/photos/2026/sunset.jpg")).toBe(
      "/_api/public/photos/2026/sunset.jpg",
    );
    expect(photosContentUrl("2026/sunset.jpg")).toBe("/_api/public/photos/2026/sunset.jpg");
    expect(photosContentUrl("public/photos/2026/sunset.jpg")).toBe(
      "/_api/public/photos/2026/sunset.jpg",
    );
    expect(photosContentUrl("https://cdn.daopk.test/photos/sunset.jpg")).toBe(
      "https://cdn.daopk.test/photos/sunset.jpg",
    );
  });
});
