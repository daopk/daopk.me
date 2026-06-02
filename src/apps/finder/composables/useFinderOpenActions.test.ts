import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { basename, normalizeVfsPath, type Kernel, type VfsDirEntry } from "@daopk/sdk";

import { useFinderOpenActions } from "./useFinderOpenActions";
import type { FinderBindings } from "./useFinder";

type FinderOpenEvents = Kernel["events"];

function entry(
  path: string,
  kind: VfsDirEntry["kind"] = "file",
  options: Partial<VfsDirEntry> = {},
): VfsDirEntry {
  const normalized = normalizeVfsPath(path);
  return {
    name: basename(normalized),
    path: normalized,
    kind,
    size: kind === "file" ? 24 : 0,
    updatedAt: 0,
    readonly: false,
    mimeType: kind === "file" ? "text/plain" : undefined,
    ...options,
  };
}

function makeEvents(): FinderOpenEvents & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    on: vi.fn(() => () => undefined),
    once: vi.fn(() => () => undefined),
    off: vi.fn(),
  } as FinderOpenEvents & { emit: ReturnType<typeof vi.fn> };
}

function makeActions(selected: VfsDirEntry | null = null) {
  const selectedEntry = ref(selected);
  const openDirectory = vi.fn(async () => true);
  const events = makeEvents();
  const actions = useFinderOpenActions({
    events,
    finder: {
      openDirectory,
      selectedEntry: computed(() => selectedEntry.value),
    } satisfies Pick<FinderBindings, "openDirectory" | "selectedEntry">,
  });

  return { actions, events, openDirectory, selectedEntry };
}

describe("useFinderOpenActions", () => {
  it("opens directories through Finder navigation", () => {
    const { actions, events, openDirectory } = makeActions();

    actions.openEntry(entry("/home", "directory"));

    expect(openDirectory).toHaveBeenCalledWith("/home");
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("opens editable files in Editor", () => {
    const { actions, events } = makeActions(entry("/home/readme.txt"));

    actions.openSelectedEntry();

    expect(events.emit).toHaveBeenCalledWith("editor.open.requested", {
      source: "api",
      path: "/home/readme.txt",
    });
  });

  it("opens Blog posts with the post-specific event", () => {
    const { actions, events } = makeActions();
    const post = entry("/home/posts/hello-world.md", "file", { mimeType: "text/markdown" });

    actions.openEntry(post);

    expect(events.emit).toHaveBeenCalledWith("blog.post.open.requested", {
      source: "api",
      path: "/home/posts/hello-world.md",
      slug: "hello-world",
    });
  });

  it("opens Notes markdown files through launch and open events", () => {
    const { actions, events } = makeActions();
    const note = entry("/home/notes/today.md", "file", { mimeType: "text/markdown" });

    actions.openEntry(note);

    expect(events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "notes",
      source: "api",
      args: { path: "/home/notes/today.md" },
    });
    expect(events.emit).toHaveBeenCalledWith("notes.open.requested", {
      source: "api",
      path: "/home/notes/today.md",
    });
  });

  it("opens PDFs and Slidev decks through their specialized events", () => {
    const { actions, events } = makeActions();

    actions.openEntry(entry("/home/docs/report.pdf", "file", { mimeType: "application/pdf" }));
    actions.openEntry(entry("/home/slides/demo/slides.md", "file", { mimeType: "text/markdown" }));

    expect(events.emit).toHaveBeenCalledWith("pdf-viewer.open.requested", {
      source: "api",
      path: "/home/docs/report.pdf",
    });
    expect(events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "slides",
      source: "api",
      args: { path: "/home/slides/demo/slides.md" },
    });
    expect(events.emit).toHaveBeenCalledWith("slides.open.requested", {
      source: "api",
      path: "/home/slides/demo/slides.md",
    });
  });

  it("ignores stale suggestions that no longer match the entry", () => {
    const { actions, events } = makeActions();

    actions.openWithSuggestion(entry("/home/readme.txt"), {
      id: "pdf-viewer",
      label: "Open in PDF Viewer",
      manifestId: "pdf-viewer",
      args: { path: "/home/readme.txt" },
    });

    expect(events.emit).not.toHaveBeenCalled();
  });
});
