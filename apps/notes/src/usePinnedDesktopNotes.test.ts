import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { usePinnedDesktopNotes } from "./usePinnedDesktopNotes";

describe("usePinnedDesktopNotes", () => {
  beforeEach(() => {
    localStorage.clear();
    usePinnedDesktopNotes().dispose();
  });

  afterEach(() => {
    usePinnedDesktopNotes().dispose();
    localStorage.clear();
  });

  it("persists pinned notes and placement changes", () => {
    const store = usePinnedDesktopNotes();
    store.hydrate();

    store.pin("/home/notes/a.md", { x: 12, y: 24 });
    store.move("/home/notes/a.md", 96, 120);
    store.raise("/home/notes/a.md");

    expect(store.notes.value).toEqual([{ path: "/home/notes/a.md", x: 96, y: 120, z: 2 }]);

    store.dispose();
    store.hydrate();

    expect(store.notes.value).toEqual([{ path: "/home/notes/a.md", x: 96, y: 120, z: 2 }]);
  });

  it("unpins notes by normalized path", () => {
    const store = usePinnedDesktopNotes();
    store.hydrate();
    store.pin("/home/notes/a.md");

    store.unpin("/home/notes/../notes/a.md");

    expect(store.notes.value).toEqual([]);
  });
});
