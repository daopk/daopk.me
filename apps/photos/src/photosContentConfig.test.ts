import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  return import("./photosContentConfig");
}

describe("photosContentConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds Photos public API URLs from VITE_PUBLIC_API_ORIGIN", async () => {
    vi.stubEnv("VITE_PUBLIC_API_ORIGIN", "https://api.daopk.test///");

    const {
      PHOTO_THUMB_WIDTH,
      PHOTOS_CONTENT_BASE,
      photoThumbUrl,
      photosContentUrl,
      photosIndexUrl,
    } = await loadConfig();

    expect(PHOTOS_CONTENT_BASE).toBe("https://api.daopk.test/public/photos");
    expect(photosIndexUrl()).toBe("https://api.daopk.test/public/photos/index.json");
    expect(photoThumbUrl("2026/sunset.jpg", PHOTO_THUMB_WIDTH)).toBe(
      "https://api.daopk.test/public/photos/2026/sunset.jpg?w=400",
    );
    expect(photosContentUrl("/public/photos/2026/sunset.jpg")).toBe(
      "https://api.daopk.test/public/photos/2026/sunset.jpg",
    );
    expect(photosContentUrl("2026/sunset.jpg")).toBe(
      "https://api.daopk.test/public/photos/2026/sunset.jpg",
    );
    expect(photosContentUrl("public/photos/2026/sunset.jpg")).toBe(
      "https://api.daopk.test/public/photos/2026/sunset.jpg",
    );
    expect(photosContentUrl("https://cdn.daopk.test/photos/sunset.jpg")).toBe(
      "https://cdn.daopk.test/photos/sunset.jpg",
    );
  });

  it("falls back to same-origin URLs when the public API origin is unset", async () => {
    vi.stubEnv("VITE_PUBLIC_API_ORIGIN", "");

    const { PHOTOS_CONTENT_BASE, photosContentUrl, photosIndexUrl } = await loadConfig();

    expect(PHOTOS_CONTENT_BASE).toBe("/public/photos");
    expect(photosIndexUrl()).toBe("/public/photos/index.json");
    expect(photosContentUrl("/public/photos/2026/sunset.jpg")).toBe(
      "/public/photos/2026/sunset.jpg",
    );
    expect(photosContentUrl("2026/sunset.jpg")).toBe("/public/photos/2026/sunset.jpg");
  });
});
