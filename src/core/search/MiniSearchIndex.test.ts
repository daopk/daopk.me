import { describe, expect, it } from "vitest";

import { MiniSearchIndex, vfsToSearchDoc } from "~/core/search/MiniSearchIndex";

function vfsDoc(path: string, title = path) {
  return vfsToSearchDoc({
    path,
    title,
    hint: path,
    body: title,
    metadata: { path, entryKind: "file" },
  });
}

describe("MiniSearchIndex VFS support", () => {
  it("excludes VFS docs by default and includes them when requested", () => {
    const index = new MiniSearchIndex();
    index.rebuild([vfsDoc("/portfolio/about.md", "About WebOS")]);

    expect(index.query("about")).toEqual([]);
    expect(index.query("about", { kind: "vfs" })).toEqual([
      expect.objectContaining({ kind: "vfs", id: "/portfolio/about.md" }),
    ]);

    index.dispose();
  });

  it("applies per-kind caps before the overall limit", () => {
    const index = new MiniSearchIndex();
    index.rebuild([
      {
        docId: "app:about",
        kind: "app",
        rawId: "about",
        title: "About",
        hint: "system",
        keywords: "",
        rawIdSearchable: "about",
      },
      vfsDoc("/portfolio/about.md", "About file"),
      vfsDoc("/portfolio/about-2.md", "About file two"),
    ]);

    const hits = index.query("about", {
      include: ["app", "vfs"],
      perKindLimit: { app: 1, vfs: 1 },
      limit: 10,
    });

    expect(hits.filter((hit) => hit.kind === "app")).toHaveLength(1);
    expect(hits.filter((hit) => hit.kind === "vfs")).toHaveLength(1);
    index.dispose();
  });

  it("removes only the exact VFS subtree, not sibling prefixes", () => {
    const index = new MiniSearchIndex();
    index.rebuild([
      vfsDoc("/home/a", "Alpha"),
      vfsDoc("/home/a/child.md", "Child"),
      vfsDoc("/home/about.md", "About sibling"),
    ]);

    index.removeVfsSubtree("/home/a");

    expect(index.query("Alpha", { kind: "vfs" })).toEqual([]);
    expect(index.query("Child", { kind: "vfs" })).toEqual([]);
    expect(index.query("sibling", { kind: "vfs" })).toEqual([
      expect.objectContaining({ id: "/home/about.md" }),
    ]);
    index.dispose();
  });
});
