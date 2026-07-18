import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { finishLeavingModals } from "~/test/ropavModal";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { TrashItem } from "~/types/trash";

import App from "./App.vue";

function makeContext(): AppContext {
  return Object.freeze({
    manifestId: "trash",
    handleId: "trash-handle",
    args: Object.freeze({}),
  });
}

function makeKernel(seed: TrashItem[] = []): Kernel {
  const items = [...seed];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  function emit(channel: string, payload: unknown): void {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  }

  return {
    events: {
      emit: vi.fn(emit),
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
      }),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
    trash: {
      list: vi.fn(async () => [...items]),
      restore: vi.fn(async (id: string) => {
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) {
          return false;
        }
        items.splice(index, 1);
        emit("trash.changed", { operation: "restore", id });
        return true;
      }),
      remove: vi.fn(async (id: string) => {
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) {
          return false;
        }
        items.splice(index, 1);
        emit("trash.changed", { operation: "remove", id });
        return true;
      }),
      empty: vi.fn(async () => {
        items.length = 0;
        emit("trash.changed", { operation: "empty" });
        return true;
      }),
      moveToTrash: vi.fn(async () => null),
    },
  } as unknown as Kernel;
}

function mountTrash(kernel: Kernel) {
  return mount(App, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: makeContext(),
      },
    },
  });
}

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find(
    (button): button is HTMLButtonElement => button.textContent?.trim() === text,
  );
}

const item: TrashItem = {
  id: "trash-1",
  name: "draft.md",
  originalPath: "/home/notes/draft.md",
  deletedAt: new Date("2026-05-26T10:00:00Z").getTime(),
  kind: "file",
  size: 1024,
  mimeType: "text/markdown;charset=utf-8",
};

describe("Trash App.vue", () => {
  afterEach(async () => {
    await finishLeavingModals();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders the empty state", async () => {
    const kernel = makeKernel();
    const wrapper = mountTrash(kernel);

    await flushPromises();

    expect(wrapper.text()).toContain("No deleted items.");
    expect(kernel.trash.list).toHaveBeenCalledWith({ handleId: "trash-handle" });

    wrapper.unmount();
  });

  it("lists deleted items and restores one", async () => {
    const kernel = makeKernel([item]);
    const wrapper = mountTrash(kernel);

    await flushPromises();
    expect(wrapper.text()).toContain("draft.md");
    expect(wrapper.text()).toContain("/home/notes/draft.md");

    const restoreButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Restore"));
    expect(restoreButton).toBeDefined();
    await restoreButton!.trigger("click");
    await flushPromises();

    expect(kernel.trash.restore).toHaveBeenCalledWith("trash-1", { handleId: "trash-handle" });
    expect(wrapper.text()).toContain("No deleted items.");

    wrapper.unmount();
  });

  it("deletes one item permanently", async () => {
    const kernel = makeKernel([item]);
    const wrapper = mountTrash(kernel);

    await flushPromises();
    const deleteButton = findButtonByText("Delete...");
    expect(deleteButton).toBeDefined();
    deleteButton!.click();
    await flushPromises();

    expect(kernel.trash.remove).not.toHaveBeenCalled();

    const confirmButton = findButtonByText("Delete Permanently");
    expect(confirmButton).toBeDefined();
    confirmButton!.click();
    await flushPromises();

    expect(kernel.trash.remove).toHaveBeenCalledWith("trash-1", { handleId: "trash-handle" });

    await finishLeavingModals();
    wrapper.unmount();
  });

  it("empties Trash", async () => {
    const kernel = makeKernel([item]);
    const wrapper = mountTrash(kernel);

    await flushPromises();
    const emptyButton = findButtonByText("Empty Trash...");
    expect(emptyButton).toBeDefined();
    emptyButton!.click();
    await flushPromises();

    expect(kernel.trash.empty).not.toHaveBeenCalled();

    const confirmButton = findButtonByText("Empty Trash");
    expect(confirmButton).toBeDefined();
    confirmButton!.click();
    await flushPromises();

    expect(kernel.trash.empty).toHaveBeenCalledWith({ handleId: "trash-handle" });
    expect(wrapper.text()).toContain("No deleted items.");

    await finishLeavingModals();
    wrapper.unmount();
  });
});
