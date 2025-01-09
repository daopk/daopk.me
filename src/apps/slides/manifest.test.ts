import { describe, expect, it } from "vitest";

import { slidesManifest } from "./manifest";

describe("slidesManifest", () => {
  it("declares the Slides app contract", async () => {
    expect(slidesManifest).toMatchObject({
      id: "slides",
      name: "Slides",
      category: "productivity",
      singleton: true,
      permissions: ["vfs.read", "vfs.write", "network.fetch"],
      keywords: expect.arrayContaining(["slidev", "deck", "presentation"]),
    });

    await expect(slidesManifest.component()).resolves.toHaveProperty("default");
  });
});
