import { computed, onUnmounted, ref, type ComputedRef } from "vue";

import { subscribePrefersReducedMotion } from "~/core/devices";
import { useSettings } from "~/composables/useSettings";

interface UseReducedMotion {
  readonly reduced: ComputedRef<boolean>;
}

export function useReducedMotion(): UseReducedMotion {
  const settings = useSettings();

  const osPref = ref(false);

  const dispose = subscribePrefersReducedMotion((reduced) => {
    osPref.value = reduced;
  });

  onUnmounted(dispose);

  const reduced = computed<boolean>(() => {
    switch (settings.reduceMotion) {
      case "always":
        return true;

      case "never":
        return false;

      case "auto":
        return osPref.value;
    }
  });

  return { reduced };
}
