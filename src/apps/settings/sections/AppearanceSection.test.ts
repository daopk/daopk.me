import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import AppearanceSection from "./AppearanceSection.vue";

import type { Kernel, KernelEventMap } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

interface FakeKernel {
  kernel: Kernel;
  setThemeSpy: ReturnType<typeof vi.fn>;
  setOverrideSpy: ReturnType<typeof vi.fn>;
  unsetOverrideSpy: ReturnType<typeof vi.fn>;
  emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void;
  setAccent(next: string | undefined): void;
}

function makeFakeKernel(initialPreference: "light" | "dark" | "system" = "system"): FakeKernel {
  const overrides: Record<string, string> = {};
  type EventListener = (payload: unknown) => void;
  const listeners = new Map<keyof KernelEventMap, Set<EventListener>>();

  const setThemeSpy = vi.fn();
  const setOverrideSpy = vi.fn((key: string, value: string): void => {
    overrides[key] = value;
  });
  const unsetOverrideSpy = vi.fn((key: string): void => {
    delete overrides[key];
  });

  const themeListeners = new Set<(theme: "light" | "dark") => void>();

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
    settings: {
      use: vi.fn((key: string) => {
        if (key === "theme") {
          return { value: initialPreference };
        }
        return { value: null };
      }),
    },
    theme: {
      current: (): "light" | "dark" => (initialPreference === "dark" ? "dark" : "light"),
      setTheme: setThemeSpy,
      subscribe: vi.fn((cb: (t: "light" | "dark") => void) => {
        themeListeners.add(cb);
        return () => {
          themeListeners.delete(cb);
        };
      }),
      list: () => ["light", "dark"] as const,
      currentOverrides: () => ({ ...overrides }),
      setOverride: setOverrideSpy,
      unsetOverride: unsetOverrideSpy,
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
    setThemeSpy,
    setOverrideSpy,
    unsetOverrideSpy,
    emit,
    setAccent(next): void {
      if (next === undefined) {
        delete overrides["--color-accent"];
      } else {
        overrides["--color-accent"] = next;
      }
    },
  };
}

function mountSection(fake: FakeKernel) {
  return mount(AppearanceSection, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: fake.kernel },
    },
  });
}

describe("AppearanceSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders three theme cards + accent swatches", () => {
    const fake = makeFakeKernel("system");
    const wrapper = mountSection(fake);

    expect(wrapper.findAll(".appearance__theme-card")).toHaveLength(3);
    expect(wrapper.findAll(".appearance__swatch").length).toBeGreaterThanOrEqual(6);

    wrapper.unmount();
  });

  it("renders the system theme preview as paired light and dark panes", () => {
    const fake = makeFakeKernel("system");
    const wrapper = mountSection(fake);

    const systemPreview = wrapper.find('.appearance__theme-preview[data-variant="system"]');
    expect(systemPreview.exists()).toBe(true);
    expect(systemPreview.findAll(".appearance__theme-preview-pane")).toHaveLength(2);
    expect(systemPreview.find(".appearance__theme-preview-pane--light").exists()).toBe(true);
    expect(systemPreview.find(".appearance__theme-preview-pane--dark").exists()).toBe(true);

    wrapper.unmount();
  });

  it("clicking a theme card delegates to kernel.theme.setTheme", async () => {
    const fake = makeFakeKernel("system");
    const wrapper = mountSection(fake);

    const darkCard = wrapper.findAll(".appearance__theme-card")[2];
    expect(darkCard?.text()).toContain("Dark");
    await darkCard?.trigger("click");

    expect(fake.setThemeSpy).toHaveBeenCalledWith("dark");

    wrapper.unmount();
  });

  it("clicking a non-default swatch calls kernel.theme.setOverride for --color-accent", async () => {
    const fake = makeFakeKernel("light");
    const wrapper = mountSection(fake);

    const oceanSwatch = wrapper.findAll(".appearance__swatch")[1];
    await oceanSwatch?.trigger("click");

    expect(fake.setOverrideSpy).toHaveBeenCalledWith("--color-accent", "#0284c7");

    wrapper.unmount();
  });

  it("clicking the Default swatch calls unsetOverride (not setOverride to literal hex)", async () => {
    const fake = makeFakeKernel("light");
    fake.setAccent("#0284c7"); // start with an override applied
    const wrapper = mountSection(fake);

    const defaultSwatch = wrapper.findAll(".appearance__swatch")[0];
    await defaultSwatch?.trigger("click");

    expect(fake.unsetOverrideSpy).toHaveBeenCalledWith("--color-accent");
    expect(fake.setOverrideSpy).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("listens to tokens.changed and re-evaluates the selected swatch", async () => {
    const fake = makeFakeKernel("light");
    const wrapper = mountSection(fake);

    expect(wrapper.findAll(".appearance__swatch")[0]?.classes()).toContain(
      "appearance__swatch--active",
    );

    fake.setAccent("#15803d"); // simulate Forest applied externally
    fake.emit("tokens.changed", { keys: ["--color-accent"], source: "local" });

    await nextTick();

    expect(wrapper.findAll(".appearance__swatch")[2]?.classes()).toContain(
      "appearance__swatch--active",
    );

    wrapper.unmount();
  });
});
