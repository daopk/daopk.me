import { computed, onUnmounted, ref, type ComputedRef } from "vue";

import { useKernel } from "~/composables/useKernel";
import { useSettings } from "~/composables/useSettings";
import type { ResolvedTheme, ThemeName, ThemePreference } from "~/types/theme";

export function useTheme(): {
  theme: ComputedRef<ResolvedTheme>;
  preference: ComputedRef<ThemePreference>;
  setTheme(name: ThemePreference): void;
  toggle(): void;
  list(): readonly ThemeName[];
} {
  const tm = useKernel().theme;

  const settings = useSettings();

  const themeRef = ref<ResolvedTheme>(tm.current());

  onUnmounted(
    tm.subscribe((t) => {
      themeRef.value = t;
    }),
  );

  return {
    theme: computed(() => themeRef.value),

    preference: computed(() => settings.theme),

    setTheme(name: ThemePreference): void {
      tm.setTheme(name);
    },

    toggle(): void {
      const next: ResolvedTheme = themeRef.value === "light" ? "dark" : "light";

      tm.setTheme(next);
    },

    list(): readonly ThemeName[] {
      return tm.list();
    },
  };
}
