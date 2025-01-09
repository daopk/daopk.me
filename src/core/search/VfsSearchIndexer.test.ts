import { describe, expect, it, vi } from "vitest";

import { MiniSearchIndex } from "~/core/search/MiniSearchIndex";
import { VfsSearchIndexer } from "~/core/search/VfsSearchIndexer";
import { MemoryAdapter } from "~/core/vfs/adapters/MemoryAdapter";
import { createMemoryVfsBootstrap } from "~/core/vfs/VFS";
import type { KernelEventMap, KernelEventsFacade } from "~/types/kernel";

function makeEvents(): Pick<KernelEventsFacade, "on"> & {
  emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void;
} {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  return {
    on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
      let bucket = listeners.get(channel);
      if (bucket === undefined) {
        bucket = new Set();
        listeners.set(channel, bucket);
      }
      bucket.add(listener);

      return () => {
        bucket?.delete(listener);
      };
    }) as KernelEventsFacade["on"],
    emit(channel, payload): void {
      for (const listener of listeners.get(channel) ?? []) {
        listener(payload);
      }
    },
  };
}

function makeIndexer() {
  const vfs = createMemoryVfsBootstrap();
  vfs.mount(
    "/portfolio",
    new MemoryAdapter({
      id: "portfolio-test",
      seed: {
        directories: ["/posts"],
        files: {
          "/about.md": {
            text: "# About WebOS\n\nA browser tab that behaves like a small OS.",
            mimeType: "text/markdown;charset=utf-8",
          },
          "/posts/field-notes.md": {
            text: "# Field Notes\n\nField notes keep content searchable across the runtime surface.",
            mimeType: "text/markdown;charset=utf-8",
          },
          "/image.bin": {
            bytes: new Uint8Array([1, 2, 3]),
            mimeType: "application/octet-stream",
          },
        },
      },
    }),
    { id: "portfolio-test" },
  );
  const events = makeEvents();

  return {
    vfs,
    events,
    indexer: new VfsSearchIndexer({ vfs, events, roots: ["/portfolio"] }),
  };
}

describe("VfsSearchIndexer", () => {
  it("crawls VFS roots into searchable path and markdown body docs", async () => {
    const { indexer } = makeIndexer();
    const docs = await indexer.crawl();
    const index = new MiniSearchIndex();

    index.rebuild(docs);

    const titleHits = index.query("Field Notes", { kind: "vfs" });
    expect(titleHits[0]).toEqual(
      expect.objectContaining({
        kind: "vfs",
        id: "/portfolio/posts/field-notes.md",
        title: "Field Notes",
        vfs: expect.objectContaining({
          path: "/portfolio/posts/field-notes.md",
          snippet: expect.stringContaining("Field notes keep content"),
        }),
      }),
    );

    const bodyHits = index.query("runtime surface", { kind: "vfs" });
    expect(bodyHits.some((hit) => hit.id === "/portfolio/posts/field-notes.md")).toBe(true);

    const binaryHits = index.query("image.bin", { kind: "vfs" });
    expect(binaryHits[0]?.vfs?.snippet).toBeUndefined();
    index.dispose();
  });

  it("maps vfs.changed events to replace and exact subtree removal", async () => {
    const { events, indexer } = makeIndexer();
    const replace = vi.fn();
    const removeVfsSubtree = vi.fn();
    const stop = indexer.subscribe({ replace, removeVfsSubtree });

    events.emit("vfs.changed", {
      path: "/portfolio/about.md",
      operation: "write",
      kind: "file",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ rawId: "/portfolio/about.md" }));

    events.emit("vfs.changed", {
      path: "/portfolio/posts",
      operation: "remove",
      kind: "directory",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(removeVfsSubtree).toHaveBeenCalledWith("/portfolio/posts");
    stop();
  });
});
