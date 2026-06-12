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

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 12 },
    clientY: { value: 24 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

function pointerEvent(
  type: string,
  init: { button?: number; clientX?: number; clientY?: number } = {},
): PointerEvent {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(ev, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
  });
  return ev;
}

async function flushReka(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushPromises();
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
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
    const note: PinnedDesktopNote = {
      path: "/home/notes/a.md",
      x: 10,
      y: 20,
      z: 1,
      color: "yellow",
    };
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

  it("moves the desktop note when dragging from the title", async () => {
    const { kernel } = makeKernel();
    const store = usePinnedDesktopNotes();
    store.hydrate();
    store.pin("/home/notes/a.md", { x: 32, y: 48 });
    const note = store.notes.value[0]!;
    const wrapper = mountSticky(note, kernel);

    await flushPromises();
    wrapper
      .get(".desktop-sticky-note__title")
      .element.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 30 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 86, clientY: 72 }));
    document.dispatchEvent(pointerEvent("pointerup", { clientX: 86, clientY: 72 }));
    await nextTick();

    expect(store.notes.value[0]).toMatchObject({ path: "/home/notes/a.md", x: 98, y: 90 });

    wrapper.unmount();
  });

  it("still focuses the title for editing when clicking without dragging", async () => {
    const { kernel } = makeKernel();
    const note: PinnedDesktopNote = {
      path: "/home/notes/a.md",
      x: 10,
      y: 20,
      z: 1,
      color: "yellow",
    };
    const wrapper = mountSticky(note, kernel);

    await flushPromises();
    const title = wrapper.get(".desktop-sticky-note__title").element as HTMLInputElement;
    title.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 30 }));
    document.dispatchEvent(pointerEvent("pointerup", { clientX: 20, clientY: 30 }));
    await nextTick();

    expect(document.activeElement).toBe(title);
    expect(title.selectionStart).toBe(title.value.length);

    wrapper.unmount();
  });

  it("changes note color from the first context-menu row", async () => {
    const { kernel } = makeKernel();
    const store = usePinnedDesktopNotes();
    store.hydrate();
    store.pin("/home/notes/a.md");
    const note = store.notes.value[0]!;
    const wrapper = mountSticky(note, kernel);

    await flushPromises();
    dispatchContextMenu(wrapper.get(".desktop-sticky-note").element);
    await flushReka();

    expect(menuItems()[0]?.classList.contains("desktop-sticky-note__color-dot")).toBe(true);
    expect(menuItems()[5]?.textContent?.trim()).toBe("Open in Notes");

    document.body.querySelector<HTMLElement>('[aria-label="Change note color to Blue"]')?.click();
    await flushReka();

    expect(store.notes.value[0]?.color).toBe("blue");

    wrapper.unmount();
  });
});
