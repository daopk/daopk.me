import { describe, expect, it } from "vitest";

import { MemoryAdapter, VFS } from "~/core/vfs";
import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";

import {
  SLIDE_DECK_MIME_TYPE,
  SlidesLibraryError,
  extractSlideDeckTitle,
  starterDeckSource,
  useSlidesLibrary,
  type SlidesLibraryVfsClient,
} from "./useSlidesLibrary";

function createVfsClient(): { readonly vfs: VFS; readonly client: SlidesLibraryVfsClient } {
  const vfs = new VFS();
  vfs.mount(
    "/",
    new MemoryAdapter({
      id: "root",
      seed: { directories: ["/home"] },
    }),
    { id: "root" },
  );

  return {
    vfs,
    client: {
      stat: (path) => vfs.stat(path),
      list: (path) => vfs.list(path),
      readText: (path) => vfs.readText(path),
      writeText: (path, text, options) => vfs.writeText(path, text, options),
      mkdir: (path, options) => vfs.mkdir(path, options),
    },
  };
}

describe("useSlidesLibrary", () => {
  it("creates the slides root and starter deck", async () => {
    const { vfs, client } = createVfsClient();
    const library = useSlidesLibrary({ vfs: client });

    const deck = await library.createDeck("Product Roadmap");

    expect(deck).toMatchObject({
      slug: "product-roadmap",
      title: "Product Roadmap",
      directoryPath: "/home/slides/product-roadmap",
      filePath: "/home/slides/product-roadmap/slides.md",
    });
    await expect(vfs.stat("/home/slides")).resolves.toMatchObject({ kind: "directory" });
    await expect(vfs.stat(deck.filePath)).resolves.toMatchObject({
      kind: "file",
      mimeType: SLIDE_DECK_MIME_TYPE,
    });
    await expect(vfs.readText(deck.filePath)).resolves.toContain("# Product Roadmap");
  });

  it("deduplicates slugs when creating decks", async () => {
    const { client } = createVfsClient();
    const library = useSlidesLibrary({ vfs: client });

    const first = await library.createDeck("Weekly Sync");
    const second = await library.createDeck("Weekly Sync");

    expect(first.slug).toBe("weekly-sync");
    expect(second.slug).toBe("weekly-sync-2");
  });

  it("lists and opens decks from VFS", async () => {
    const { client } = createVfsClient();
    const library = useSlidesLibrary({ vfs: client });

    await library.createDeck("Beta Notes");
    await library.createDeck("Alpha Notes");

    await expect(library.listDecks()).resolves.toEqual([
      expect.objectContaining({ slug: "alpha-notes", title: "Alpha Notes" }),
      expect.objectContaining({ slug: "beta-notes", title: "Beta Notes" }),
    ]);
    await expect(library.openDeck("/home/slides/alpha-notes/slides.md")).resolves.toMatchObject({
      deck: expect.objectContaining({ slug: "alpha-notes", title: "Alpha Notes" }),
      source: expect.stringContaining("# Alpha Notes"),
    });
  });

  it("saves an existing deck", async () => {
    const { client } = createVfsClient();
    const library = useSlidesLibrary({ vfs: client });
    await library.createDeck("Launch");

    const saved = await library.saveDeck(
      "launch",
      `---
title: Updated Launch
---

# Updated Launch
`,
    );

    expect(saved).toMatchObject({ slug: "launch", title: "Updated Launch" });
    await expect(library.openDeck("launch")).resolves.toMatchObject({
      source: expect.stringContaining("# Updated Launch"),
    });
  });

  it("treats permission nulls as permission denied", async () => {
    const library = useSlidesLibrary({
      vfs: {
        stat: async (): Promise<VfsStat | null> => null,
        list: async (): Promise<readonly VfsDirEntry[] | null> => null,
        readText: async (): Promise<string | null> => null,
        writeText: async (): Promise<VfsStat | null> => null,
        mkdir: async (): Promise<VfsStat | null> => null,
      },
    });

    await expect(library.listDecks()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    } satisfies Partial<SlidesLibraryError>);
  });
});

describe("slide deck source helpers", () => {
  it("extracts frontmatter and heading titles", () => {
    expect(extractSlideDeckTitle(starterDeckSource("Roadshow"), "fallback")).toBe("Roadshow");
    expect(extractSlideDeckTitle("# Heading Title", "fallback-title")).toBe("Heading Title");
    expect(extractSlideDeckTitle("No title", "fallback-title")).toBe("Fallback Title");
  });
});
