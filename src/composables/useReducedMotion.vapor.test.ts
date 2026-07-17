import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReducedMotion } from "~/composables/useReducedMotion";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import { mountVaporComposable } from "~/test/mountVapor";

interface MediaListener {
  cb: (event: MediaQueryListEvent) => void;
}

function createMatchMediaStub(initialReducedMatch: boolean): {
  matchMedia: typeof window.matchMedia;
  fire(matches: boolean): void;
  listeners: MediaListener[];
} {
  const listeners: MediaListener[] = [];
  let currentMatch = initialReducedMatch;

  const matchMedia = ((query: string): MediaQueryList => {
    return {
      media: query,
      get matches(): boolean {
        return currentMatch;
      },
      addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void): void => {
        listeners.push({ cb });
      },
      removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void): void => {
        const i = listeners.findIndex((l) => l.cb === cb);
        if (i !== -1) {
          listeners.splice(i, 1);
        }
      },
      addListener: (): void => {},
      removeListener: (): void => {},
      dispatchEvent: (): boolean => false,
      onchange: null,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    matchMedia,
    listeners,
    fire(matches: boolean): void {
      currentMatch = matches;
      for (const { cb } of listeners) {
        cb({ matches } as MediaQueryListEvent);
      }
    },
  };
}

function mountHarness() {
  return mountVaporComposable(() => useReducedMotion());
}

describe("useReducedMotion", () => {
  let stub: ReturnType<typeof createMatchMediaStub>;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useSettingsStore().hydrate();

    stub = createMatchMediaStub(false);
    vi.stubGlobal("matchMedia", stub.matchMedia);
  });

  afterEach(() => {
    try {
      useSettingsStore().dispose();
    } catch {}
    vi.unstubAllGlobals();
  });

  it("returns false when reduceMotion='auto' and OS does not prefer reduce", () => {
    useSettingsStore().$patch({ reduceMotion: "auto" });

    const { result: m, wrapper } = mountHarness();

    expect(m.reduced.value).toBe(false);

    wrapper.unmount();
  });

  it("returns true when reduceMotion='auto' and OS prefers reduce (initial match)", () => {
    stub = createMatchMediaStub(true);
    vi.stubGlobal("matchMedia", stub.matchMedia);

    useSettingsStore().$patch({ reduceMotion: "auto" });

    const { result: m, wrapper } = mountHarness();

    expect(m.reduced.value).toBe(true);

    wrapper.unmount();
  });

  it("returns true for reduceMotion='always' regardless of OS", () => {
    useSettingsStore().$patch({ reduceMotion: "always" });

    const { result: m, wrapper } = mountHarness();

    expect(m.reduced.value).toBe(true);

    stub.fire(true);
    expect(m.reduced.value).toBe(true);

    wrapper.unmount();
  });

  it("returns false for reduceMotion='never' regardless of OS", () => {
    useSettingsStore().$patch({ reduceMotion: "never" });

    const { result: m, wrapper } = mountHarness();

    expect(m.reduced.value).toBe(false);

    stub.fire(true);
    expect(m.reduced.value).toBe(false);

    wrapper.unmount();
  });

  it("tracks OS change events when reduceMotion='auto'", async () => {
    useSettingsStore().$patch({ reduceMotion: "auto" });

    const { result: m, wrapper } = mountHarness();

    expect(m.reduced.value).toBe(false);

    stub.fire(true);
    await wrapper.vm.$nextTick();
    expect(m.reduced.value).toBe(true);

    stub.fire(false);
    await wrapper.vm.$nextTick();
    expect(m.reduced.value).toBe(false);

    wrapper.unmount();
  });

  it("cleans up the matchMedia listener on unmount", async () => {
    useSettingsStore().$patch({ reduceMotion: "auto" });

    const wrapper = mountHarness();
    expect(stub.listeners.length).toBe(1);

    wrapper.unmount();
    await wrapper.wrapper.vm.$nextTick();
    expect(stub.listeners.length).toBe(0);
  });
});
