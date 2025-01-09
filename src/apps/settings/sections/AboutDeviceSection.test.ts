import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import AboutDeviceSection from "./AboutDeviceSection.vue";

import { useSettingsStore } from "~/core/storage/SettingsStore";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import type { Kernel, KernelEventMap } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

interface FakeKernelHandles {
  kernel: Kernel;
  emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void;
  setOverride(key: string, value: string | undefined): void;
}

function makeFakeKernel(): FakeKernelHandles {
  const overrides: Record<string, string> = {};
  type EventListener = (payload: unknown) => void;
  const listeners = new Map<keyof KernelEventMap, Set<EventListener>>();

  function emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void {
    const bucket = listeners.get(channel);
    if (!bucket) {
      return;
    }
    for (const listener of bucket) {
      listener(payload);
    }
  }

  const kernel = {
    theme: {
      current: vi.fn(() => "light" as const),
      setTheme: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      list: () => ["light", "dark"] as const,
      currentOverrides: () => ({ ...overrides }),
      setOverride: vi.fn(),
      unsetOverride: vi.fn(),
      setOverrides: vi.fn(),
      resetOverrides: vi.fn(),
    },
    events: {
      on: vi.fn(<K extends keyof KernelEventMap>(channel: K, cb: EventListener) => {
        const bucket = listeners.get(channel) ?? new Set<EventListener>();
        bucket.add(cb);
        listeners.set(channel, bucket);
        return () => {
          bucket.delete(cb);
        };
      }),
      once: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  } as unknown as Kernel;

  return {
    kernel,
    emit,
    setOverride(key, value): void {
      if (value === undefined) {
        delete overrides[key];
      } else {
        overrides[key] = value;
      }
    },
  };
}

function mountSection(fake: FakeKernelHandles) {
  return mount(AboutDeviceSection, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: fake.kernel },
    },
  });
}

describe("AboutDeviceSection (M2b.1bis)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal(
      "matchMedia",
      (q: string): MediaQueryList =>
        ({
          media: q,
          matches: false,
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as MediaQueryList,
    );
    serviceWorkerUpdateController.resetForTests();
  });

  afterEach(() => {
    serviceWorkerUpdateController.resetForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the diagnostic rows for boot count, form factor, theme, reduce motion, overrides", () => {
    const fake = makeFakeKernel();
    const store = useSettingsStore();
    store.$patch({ bootCount: 7, theme: "dark", reduceMotion: "never" });

    const wrapper = mountSection(fake);

    const text = wrapper.text();
    expect(text).toContain("Boot count");
    expect(text).toContain("7");
    expect(text).toContain("Form factor");
    expect(text).toContain("Theme preference");
    expect(text).toContain("dark");
    expect(text).toContain("Reduce motion");
    expect(text).toContain("never");
    expect(text).toContain("Active overrides");

    wrapper.unmount();
  });

  it("renders 0 in the override badge when no overrides are set", () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    const badge = wrapper.find(".about-device__badge");
    expect(badge.text()).toBe("0");
    expect(badge.attributes("data-empty")).toBe("true");
    expect(wrapper.text()).toContain("stylesheet defaults in use");

    wrapper.unmount();
  });

  it("renders the override map when overrides are present", () => {
    const fake = makeFakeKernel();
    fake.setOverride("--color-accent", "#abc");
    fake.setOverride("--density-scale", "0.85");
    const wrapper = mountSection(fake);

    const badge = wrapper.find(".about-device__badge");
    expect(badge.text()).toBe("2");
    expect(badge.attributes("data-empty")).toBe("false");

    const items = wrapper.findAll(".about-device__override-item");
    expect(items).toHaveLength(2);

    const allText = items.map((i) => i.text()).join(" ");
    expect(allText).toContain("--color-accent");
    expect(allText).toContain("#abc");
    expect(allText).toContain("--density-scale");
    expect(allText).toContain("0.85");

    wrapper.unmount();
  });

  it("tokens.changed reactivity updates the override count without a re-mount", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    expect(wrapper.find(".about-device__badge").text()).toBe("0");

    fake.setOverride("--color-accent", "#abc");
    fake.emit("tokens.changed", { keys: ["--color-accent"], source: "local" });
    await nextTick();

    expect(wrapper.find(".about-device__badge").text()).toBe("1");

    fake.setOverride("--density-scale", "1.15");
    fake.emit("tokens.changed", { keys: ["--density-scale"], source: "local" });
    await nextTick();

    expect(wrapper.find(".about-device__badge").text()).toBe("2");

    wrapper.unmount();
  });

  it("runs a manual update check from the software update row", async () => {
    const fake = makeFakeKernel();
    const check = vi.fn(async () => undefined);
    serviceWorkerUpdateController.setUpdateChecker(check);
    const wrapper = mountSection(fake);

    const button = wrapper.get("button");
    expect(wrapper.text()).toContain("Software update");
    expect(button.text()).toContain("Check for updates");

    await button.trigger("click");
    await flushPromises();

    expect(check).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("You're up to date.");

    wrapper.unmount();
  });

  it("refreshes from the software update row when an update is available", async () => {
    const fake = makeFakeKernel();
    const update = vi.fn(async () => undefined);
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const wrapper = mountSection(fake);

    expect(wrapper.text()).toContain("Update available");
    expect(wrapper.get("button").text()).toContain("Refresh");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
