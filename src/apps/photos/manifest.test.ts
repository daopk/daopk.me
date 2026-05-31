import { describe, expect, it } from "vitest";

import { photosManifest } from "./manifest";

describe("photosManifest", () => {
  it("registers a visible, singleton media app", () => {
    expect(photosManifest.id).toBe("photos");
    expect(photosManifest.name).toBe("Photos");
    expect(photosManifest.category).toBe("media");
    expect(photosManifest.hidden).toBeUndefined();
    expect(photosManifest.singleton).toBe(true);
  });

  it("requests only network access for the read-only R2 gallery", () => {
    expect(photosManifest.permissions).toEqual(["network.fetch"]);
  });
});
