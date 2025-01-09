import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCommands } from "~/composables/useCommands";

import type { CommandManifest } from "~/types/command";
import type { Kernel, KernelEventName } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

interface FakeKernel {
  kernel: Kernel;
  store: Map<string, CommandManifest>;
  triggerEvent: (name: KernelEventName, payload: unknown) => void;
}

function makeFakeKernel(): FakeKernel {
  const store = new Map<string, CommandManifest>();
  const listeners = new Map<KernelEventName, Set<(p: unknown) => void>>();

  const fakeEvents: Kernel["events"] = {
    emit: vi.fn(),
    on: ((channel: KernelEventName, listener: (p: unknown) => void) => {
      const bucket = listeners.get(channel) ?? new Set();
      bucket.add(listener);
      listeners.set(channel, bucket);
      return () => {
        bucket.delete(listener);
      };
    }) as unknown as Kernel["events"]["on"],
    once: ((channel: KernelEventName, listener: (p: unknown) => void) => {
      const wrapper = (p: unknown): void => {
        off();
        listener(p);
      };
      const off = fakeEvents.on(channel as KernelEventName, wrapper as never);
      return off;
    }) as unknown as Kernel["events"]["once"],
    off: ((): void => {}) as unknown as Kernel["events"]["off"],
  };

  const fakeCommands: Kernel["commands"] = {
    register: vi.fn((manifest: CommandManifest) => {
      store.set(manifest.id, manifest);
      return () => {
        store.delete(manifest.id);
      };
    }),
    unregister: vi.fn((id: string) => {
      store.delete(id);
    }),
    dispatch: vi.fn(async () => {}),
    list: () => Array.from(store.values()),
  };

  const kernel = { events: fakeEvents, commands: fakeCommands } as unknown as Kernel;

  return {
    kernel,
    store,
    triggerEvent: (name, payload) => {
      const bucket = listeners.get(name);
      if (!bucket) {
        return;
      }
      for (const listener of bucket) {
        listener(payload);
      }
    },
  };
}

function harnessWith(kernel: Kernel): {
  bindings: ReturnType<typeof useCommands>;
  unmount: () => void;
} {
  let bindings: ReturnType<typeof useCommands> | undefined;

  const wrapper = mount(
    defineComponent({
      setup() {
        bindings = useCommands();
        return () => null;
      },
    }),
    {
      global: { provide: { [KernelInjectionKey as symbol]: kernel } },
    },
  );

  if (!bindings) {
    throw new Error("useCommands harness failed to capture bindings");
  }

  return { bindings, unmount: () => wrapper.unmount() };
}

describe("useCommands — composable (M2a.2 follow-up)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds `commands.value` from kernel.commands.list() at mount", () => {
    const fake = makeFakeKernel();
    fake.store.set("alpha", { id: "alpha", title: "Alpha", run: () => {} });
    fake.store.set("beta", { id: "beta", title: "Beta", run: () => {} });

    const { bindings, unmount } = harnessWith(fake.kernel);

    expect(bindings.commands.value.map((c) => c.id)).toEqual(["alpha", "beta"]);

    unmount();
  });

  it("refreshes commands.value on command.registered", () => {
    const fake = makeFakeKernel();
    const { bindings, unmount } = harnessWith(fake.kernel);

    expect(bindings.commands.value).toEqual([]);

    fake.store.set("new", { id: "new", title: "New", run: () => {} });
    fake.triggerEvent("command.registered", { id: "new" });

    expect(bindings.commands.value.map((c) => c.id)).toEqual(["new"]);

    unmount();
  });

  it("refreshes commands.value on command.unregistered", () => {
    const fake = makeFakeKernel();
    fake.store.set("doomed", { id: "doomed", title: "Doomed", run: () => {} });

    const { bindings, unmount } = harnessWith(fake.kernel);
    expect(bindings.commands.value.map((c) => c.id)).toEqual(["doomed"]);

    fake.store.delete("doomed");
    fake.triggerEvent("command.unregistered", { id: "doomed" });

    expect(bindings.commands.value).toEqual([]);

    unmount();
  });

  it("delegates register / unregister / dispatch to the kernel facade", async () => {
    const fake = makeFakeKernel();
    const { bindings, unmount } = harnessWith(fake.kernel);

    const manifest: CommandManifest = { id: "delegated", title: "Delegated", run: () => {} };
    bindings.register(manifest);
    expect(fake.kernel.commands.register).toHaveBeenCalledWith(manifest);

    await bindings.dispatch("delegated", { source: "spotlight" });
    expect(fake.kernel.commands.dispatch).toHaveBeenCalledWith("delegated", {
      source: "spotlight",
    });

    bindings.unregister("delegated");
    expect(fake.kernel.commands.unregister).toHaveBeenCalledWith("delegated");

    unmount();
  });

  it("disposes event listeners on component unmount (no leak)", () => {
    const fake = makeFakeKernel();
    const { bindings, unmount } = harnessWith(fake.kernel);

    unmount();

    const snapshotBefore = bindings.commands.value;
    fake.store.set("late", { id: "late", title: "Late", run: () => {} });
    fake.triggerEvent("command.registered", { id: "late" });

    expect(bindings.commands.value).toBe(snapshotBefore);
  });
});
