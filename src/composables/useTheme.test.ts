import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type ComputedRef } from "vue";

import { useTheme } from "~/composables/useTheme";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import { KernelInjectionKey } from "~/types/kernel";
import type { Kernel } from "~/types/kernel";
import type { ResolvedTheme, ThemeName, ThemePreference } from "~/types/theme";

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
        }) as MediaQueryList,
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
    } as Kernel;

    useSettingsStore(pinia).hydrate();

    const Child = defineComponent({
      setup() {
        const t = useTheme();

        return { t };
      },

      template: "<span />",
    });

    const wrapper = mount(Child, {
      global: {
        provide: { [KernelInjectionKey as symbol]: kernelStub },

        plugins: [pinia],
      },
    });

    interface ExposedTheme {
      theme: ComputedRef<ResolvedTheme>;

      toggle(): void;
    }

    interface Exposed {
      readonly t: ExposedTheme;
    }

    const t = (wrapper.vm as unknown as Exposed).t;

    expect(t.theme.value).toBe("light");

    broadcast("dark");

    await wrapper.vm.$nextTick();

    expect(t.theme.value).toBe("dark");

    setThemeSpy.mockClear();

    t.toggle();

    expect(setThemeSpy).toHaveBeenCalledTimes(1);

    expect(setThemeSpy).toHaveBeenCalledWith("light");

    useSettingsStore().dispose();

    wrapper.unmount();
  });
});
