import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import DesktopStickyNote from "./DesktopStickyNote.vue";
import { NOTES_MIME_TYPE } from "./useNotes";
import { usePinnedDesktopNotes, type PinnedDesktopNote } from "./usePinnedDesktopNotes";

function makeContext(): AppContext {
  return Object.freeze({
    manifestId: "notes",
    handleId: "notes-renderer-handle",
    args: Object.freeze({ contributionId: "notes:desktop-layer" }),
  });
}

function makeKernel() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });
  const on = vi.fn((channel: string, listener: (payload: unknown) => void) => {
    let bucket = listeners.get(channel);
    if (bucket === undefined) {
      bucket = new Set();
      listeners.set(channel, bucket);
    }
    bucket.add(listener);
    return () => {
      bucket?.delete(listener);
    };
  });

  const kernel = {
    events: {
      emit,
      on,
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    vfs: {
      stat: vi.fn(),
      list: vi.fn(),
      read: vi.fn(),
      readText: vi.fn(async () => "# Alpha\n\nOld body"),
      write: vi.fn(),
      writeText: vi.fn(async (path: string, text: string) => ({
        path,
        kind: "file",
        size: text.length,
        createdAt: 1,
        updatedAt: 2,
        readonly: false,
        mimeType: NOTES_MIME_TYPE,
      })),
      mkdir: vi.fn(),
      remove: vi.fn(),
    },
  } as unknown as Kernel;

  return { kernel };
}

function mountSticky(note: PinnedDesktopNote, kernel: Kernel) {
  return mount(DesktopStickyNote, {
    attachTo: document.body,
    props: { note, stageSize: { width: 800, height: 600 } },
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: makeContext(),
      },
    },
  });
}

describe("DesktopStickyNote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    usePinnedDesktopNotes().dispose();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    usePinnedDesktopNotes().dispose();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads markdown and autosaves direct desktop edits", async () => {
    const { kernel } = makeKernel();
    const note: PinnedDesktopNote = { path: "/home/notes/a.md", x: 10, y: 20, z: 1 };
    const wrapper = mountSticky(note, kernel);

    await flushPromises();
    await nextTick();

    expect((wrapper.get(".desktop-sticky-note__title").element as HTMLInputElement).value).toBe(
      "Alpha",
    );

    await wrapper.get(".desktop-sticky-note__title").setValue("Pinned Alpha");
    await wrapper.get(".desktop-sticky-note__body").setValue("Updated body");
    await vi.advanceTimersByTimeAsync(800);
    await flushPromises();

    expect(kernel.vfs.writeText).toHaveBeenCalledWith(
      "/home/notes/a.md",
      "# Pinned Alpha\n\nUpdated body",
      {
        handleId: "notes-renderer-handle",
        overwrite: true,
        mimeType: NOTES_MIME_TYPE,
      },
    );

    wrapper.unmount();
  });
});
