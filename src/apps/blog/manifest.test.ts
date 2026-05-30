import { describe, expect, it } from "vitest";

import { blogManifest } from "./manifest";

describe("blogManifest", () => {
  it("is visible while keeping system VFS access for public permalinks", () => {
    expect(blogManifest.id).toBe("blog");
    expect(blogManifest.hidden).toBeUndefined();
    expect(blogManifest.category).toBe("system");
    expect(blogManifest.permissions).toContain("vfs.read");
  });
});
