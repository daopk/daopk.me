import { describe, expect, it } from "vitest";

import { currentAppBuild, nextAppBuild } from "../../scripts/lib/appBuildNumbers.mjs";

describe("first-party app build numbers", () => {
  it("starts new apps at build one", () => {
    expect(nextAppBuild({ apps: [] }, "notes")).toBe(1);
    expect(nextAppBuild({}, "notes")).toBe(1);
  });

  it("increments only the matching app build", () => {
    const catalog = {
      apps: [
        { id: "photos", version: "1.0.0", build: 10, entry: "/apps/photos/1.0.0+10/photos.js" },
        {
          id: "browser",
          version: "1.0.0",
          build: 11,
          entry: "/apps/browser/1.0.0+11/browser.js",
        },
      ],
    };

    expect(nextAppBuild(catalog, "photos")).toBe(11);
    expect(nextAppBuild(catalog, "browser")).toBe(12);
    expect(nextAppBuild(catalog, "calendar")).toBe(1);
  });

  it("uses the highest valid build for duplicate catalog entries", () => {
    const catalog = {
      apps: [
        { id: "photos", build: "10" },
        { id: "photos", build: 8 },
        { id: "photos", build: -1 },
        { id: "browser", build: 99 },
      ],
    };

    expect(currentAppBuild(catalog, "photos")).toBe(10);
    expect(nextAppBuild(catalog, "photos")).toBe(11);
  });
});
