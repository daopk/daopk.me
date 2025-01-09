import { describe, expect, it } from "vitest";

import { blogManifest } from "./manifest";

describe("blogManifest", () => {
  it("is hidden while keeping system VFS access for public permalinks", () => {
    expect(blogManifest.id).toBe("blog");
    expect(blogManifest.hidden).toBe(true);
    expect(blogManifest.category).toBe("system");
    expect(blogManifest.permissions).toContain("vfs.read");
  });
});
