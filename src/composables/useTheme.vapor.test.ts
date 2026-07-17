import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "~/composables/useTheme";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import { KernelInjectionKey } from "~/types/kernel";
import type { Kernel } from "~/types/kernel";
import type { ResolvedTheme, ThemeName, ThemePreference } from "~/types/theme";
import { mountVaporComposable } from "~/test/mountVapor";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();

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
    try {
      useSettingsStore().dispose();
    } catch {}

    vi.unstubAllGlobals();
  });

  it("tracks kernel.theme subscription; toggle calls kernel.theme.setTheme with opposing paint theme", async () => {
    const pinia = createPinia();

    setActivePinia(pinia);

    const subscribers: Array<(theme: ResolvedTheme) => void> = [];

    let resolvedFeed: ResolvedTheme = "light";

    function broadcast(theme: ResolvedTheme): void {
      resolvedFeed = theme;

      for (const subscriber of subscribers) {
        subscriber(theme);
      }
    }

    const setThemeSpy = vi.fn((preference: ThemePreference): void => {
      resolvedFeed = preference === "dark" ? "dark" : "light";

      broadcast(resolvedFeed);
    });

    const themeFacade = {
      current: (): ResolvedTheme => resolvedFeed,

      subscribe(listener: (theme: ResolvedTheme) => void): () => void {
        subscribers.push(listener);

        listener(resolvedFeed);

        return (): void => {
          const i = subscribers.indexOf(listener);

          if (i !== -1) {
            subscribers.splice(i, 1);
          }
        };
      },

      setTheme: setThemeSpy,

      list: (): readonly ThemeName[] => ["light", "dark"],
    };

    const kernelStub = {
      theme: themeFacade,
    } as unknown as Kernel;

    useSettingsStore(pinia).hydrate();

    const mounted = mountVaporComposable(() => useTheme(), {
      global: {
        provide: { [KernelInjectionKey as symbol]: kernelStub },

        plugins: [pinia],
      },
    });
    const t = mounted.result;

    expect(t.theme.value).toBe("light");

    broadcast("dark");

    await mounted.wrapper.vm.$nextTick();

    expect(t.theme.value).toBe("dark");

    setThemeSpy.mockClear();

    t.toggle();

    expect(setThemeSpy).toHaveBeenCalledTimes(1);

    expect(setThemeSpy).toHaveBeenCalledWith("light");

    useSettingsStore().dispose();

    mounted.unmount();
  });
});
