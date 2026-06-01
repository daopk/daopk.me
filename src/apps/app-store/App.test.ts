import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, type Component } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import AppStore from "./App.vue";

const IconStub = defineComponent({
  name: "IconStub",
  render: () => h("span", { class: "icon-stub" }),
});

function manifest(overrides: Partial<AppManifest> & { id: string; name: string }): AppManifest {
  return {
    version: "1.0.0",
    category: "productivity",
    icon: IconStub as Component,
    component: async () => ({ default: IconStub }),
    ...overrides,
  };
}

function makeKernel(initialApps: AppManifest[]) {
  const apps = [...initialApps];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = vi.fn((channel: string, listener: (payload: unknown) => void) => {
    const bucket = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
    bucket.add(listener);
    listeners.set(channel, bucket);
    return (): void => {
      bucket.delete(listener);
    };
  });
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });
  const kernel = {
    apps: { list: vi.fn(() => [...apps]) },
    events: { on, emit },
  } as unknown as Kernel;
  return { apps, emit, kernel };
}

const mountedWrappers: Array<ReturnType<typeof mountStore>> = [];

function mountStore(kernel: Kernel) {
  const wrapper = mount(AppStore, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel } },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("App Store", () => {
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
  });

  it("lists registered first-party apps only", () => {
    const { kernel } = makeKernel([
      manifest({ id: "notes", name: "Notes", version: "1.0.0" }),
      manifest({ id: "hello-world", name: "Hello World", version: "1.2.0" }),
      manifest({ id: "settings", name: "Settings", category: "system" }),
    ]);
    const wrapper = mountStore(kernel);

    expect(wrapper.text()).toContain("Notes");
    expect(wrapper.text()).toContain("v1.0.0");
    expect(wrapper.text()).toContain("productivity");
    expect(wrapper.text()).not.toContain("Hello World");
    expect(wrapper.text()).not.toContain("Settings");
    expect(wrapper.find(".app-store__launch").text()).toBe("Open");
  });

  it("launches a first-party app", async () => {
    const { emit, kernel } = makeKernel([manifest({ id: "notes", name: "Notes" })]);
    const wrapper = mountStore(kernel);

    await wrapper.find(".app-store__launch").trigger("click");

    expect(emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "notes",
      source: "api",
    });
  });

  it("refreshes when first-party apps are registered", async () => {
    const { apps, emit, kernel } = makeKernel([]);
    const wrapper = mountStore(kernel);

    expect(wrapper.text()).toContain("No first-party apps available.");

    apps.push(manifest({ id: "notes", name: "Notes" }));
    emit("app.registered", { manifestId: "notes" });
    await nextTick();

    expect(wrapper.text()).toContain("Notes");
  });
});
