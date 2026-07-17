import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import ComfortSection from "./ComfortSection.vue";

import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { Kernel, KernelEventMap } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

interface FakeKernel {
  kernel: Kernel;
  setOverrideSpy: ReturnType<typeof vi.fn>;
  unsetOverrideSpy: ReturnType<typeof vi.fn>;
  setSettingSpy: ReturnType<typeof vi.fn>;
  emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void;
  setOverride(key: string, value: string | undefined): void;
}

function makeFakeKernel(): FakeKernel {
  const overrides: Record<string, string> = {};
  type EventListener = (payload: unknown) => void;
  const listeners = new Map<keyof KernelEventMap, Set<EventListener>>();

  const setOverrideSpy = vi.fn((key: string, value: string): void => {
    overrides[key] = value;
  });
  const unsetOverrideSpy = vi.fn((key: string): void => {
    delete overrides[key];
  });
  const setSettingSpy = vi.fn();

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
      current: (): "light" => "light",
      setTheme: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      list: () => ["light", "dark"] as const,
      currentOverrides: () => ({ ...overrides }),
      setOverride: setOverrideSpy,
      unsetOverride: unsetOverrideSpy,
      setOverrides: vi.fn(),
      resetOverrides: vi.fn(),
    },
    settings: {
      set: setSettingSpy,
      get: vi.fn(),
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
    setOverrideSpy,
    unsetOverrideSpy,
    setSettingSpy,
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

function mountSection(fake: FakeKernel) {
  return mount(ComfortSection, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: fake.kernel },
    },
  });
}

describe("ComfortSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSettingsStore().$patch({ reduceMotion: "auto" });
    vi.stubGlobal(
      "matchMedia",
      (q: string): MediaQueryList =>
        ({
          media: q,
          matches: false,
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("groups density, motion, and typography under one shared Comfort surface", () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    expect(wrapper.find(".comfort").exists()).toBe(true);
    expect(wrapper.text()).toContain("Density");
    expect(wrapper.text()).toContain("Motion");
    expect(wrapper.text()).toContain("Typography");
    expect(wrapper.text()).toContain("Font family");
    expect(wrapper.text()).toContain("Base size");

    expect(wrapper.findAll(".comfort__density-card")).toHaveLength(3);
    expect(wrapper.findAll(".comfort__motion-card")).toHaveLength(3);
    expect(wrapper.findAll(".comfort__type-card")).toHaveLength(6);

    wrapper.unmount();
  });

  it("defaults to Cozy density, Match system motion, System family, and Medium size", () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    const densityCards = wrapper.findAll(".comfort__density-card");
    const motionCards = wrapper.findAll(".comfort__motion-card");
    const typeCards = wrapper.findAll(".comfort__type-card");

    expect(densityCards[1]?.attributes("aria-checked")).toBe("true");
    expect(motionCards[0]?.attributes("aria-checked")).toBe("true");
    expect(typeCards[0]?.attributes("aria-checked")).toBe("true");
    expect(typeCards[4]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });

  it("writes density token overrides and unsets Cozy back to the default", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    await wrapper.findAll(".comfort__density-card")[0]?.trigger("click");
    expect(fake.setOverrideSpy).toHaveBeenCalledWith("--density-scale", "0.85");

    wrapper.unmount();

    const nonDefault = makeFakeKernel();
    nonDefault.setOverride("--density-scale", "1.15");
    const secondWrapper = mountSection(nonDefault);

    await secondWrapper.findAll(".comfort__density-card")[1]?.trigger("click");
    expect(nonDefault.unsetOverrideSpy).toHaveBeenCalledWith("--density-scale");

    secondWrapper.unmount();
  });

  it("writes reduce-motion preference through kernel settings", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    await wrapper.findAll(".comfort__motion-card")[1]?.trigger("click");
    expect(fake.setSettingSpy).toHaveBeenCalledWith("reduceMotion", "always");

    await wrapper.findAll(".comfort__motion-card")[2]?.trigger("click");
    expect(fake.setSettingSpy).toHaveBeenCalledWith("reduceMotion", "never");

    wrapper.unmount();
  });

  it("marks the reduced-motion choice without rendering a status detail", () => {
    const fake = makeFakeKernel();
    useSettingsStore().$patch({ reduceMotion: "always" });

    const wrapper = mountSection(fake);

    expect(wrapper.text()).not.toContain("Currently");
    expect(wrapper.text()).not.toContain("reducing motion");
    expect(wrapper.text()).not.toContain("animating fully");
    expect(wrapper.find("[aria-live='polite']").exists()).toBe(false);
    expect(wrapper.findAll(".comfort__motion-card")[1]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });

  it("writes typography token overrides and unsets defaults", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    const typeCards = wrapper.findAll(".comfort__type-card");
    await typeCards[1]?.trigger("click");
    expect(fake.setOverrideSpy).toHaveBeenCalledWith("--font-family-base", '"Inter", sans-serif');

    await typeCards[3]?.trigger("click");
    expect(fake.setOverrideSpy).toHaveBeenCalledWith("--font-size-base", "13px");

    wrapper.unmount();

    const nonDefault = makeFakeKernel();
    nonDefault.setOverride("--font-family-base", '"Inter", sans-serif');
    nonDefault.setOverride("--font-size-base", "13px");
    const secondWrapper = mountSection(nonDefault);
    const secondTypeCards = secondWrapper.findAll(".comfort__type-card");

    await secondTypeCards[0]?.trigger("click");
    expect(nonDefault.unsetOverrideSpy).toHaveBeenCalledWith("--font-family-base");

    await secondTypeCards[4]?.trigger("click");
    expect(nonDefault.unsetOverrideSpy).toHaveBeenCalledWith("--font-size-base");

    secondWrapper.unmount();
  });

  it("tokens.changed updates active density and typography choices", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    fake.setOverride("--density-scale", "0.85");
    fake.setOverride("--font-family-base", "var(--font-mono)");
    fake.setOverride("--font-size-base", "15px");
    fake.emit("tokens.changed", {
      keys: ["--density-scale", "--font-family-base", "--font-size-base"],
      source: "local",
    });
    await nextTick();

    expect(wrapper.findAll(".comfort__density-card")[0]?.attributes("aria-checked")).toBe("true");

    const typeCards = wrapper.findAll(".comfort__type-card");
    expect(typeCards[2]?.attributes("aria-checked")).toBe("true");
    expect(typeCards[5]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });

  it("renders custom hints for unknown token overrides", () => {
    const fake = makeFakeKernel();
    fake.setOverride("--density-scale", "0.72");
    fake.setOverride("--font-family-base", "Georgia, serif");
    fake.setOverride("--font-size-base", "12px");

    const wrapper = mountSection(fake);

    const hints = wrapper.findAll(".comfort__custom-hint");
    expect(hints).toHaveLength(3);

    wrapper.unmount();
  });
});
