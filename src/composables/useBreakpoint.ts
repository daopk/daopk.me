import { computed, onUnmounted, type ComputedRef, type Ref } from "vue";

import { breakpoints, watchDeviceProfile } from "~/core/devices";
import type { DeviceProfile } from "~/types/shell";

interface BreakpointComposable {
  readonly tokens: typeof breakpoints;
  readonly profile: Ref<DeviceProfile>;
  readonly isMobile: ComputedRef<boolean>;
  readonly isTablet: ComputedRef<boolean>;
  readonly isDesktop: ComputedRef<boolean>;
  readonly isTouch: ComputedRef<boolean>;
}

export function useBreakpoint(): BreakpointComposable {
  const { profile, dispose } = watchDeviceProfile();
  onUnmounted(() => {
    dispose();
  });

  const isMobile = computed(() => profile.value.formFactor === "mobile");
  const isTablet = computed(() => profile.value.formFactor === "tablet");
  const isDesktop = computed(() => profile.value.formFactor === "desktop");
  const isTouch = computed(() => Boolean(profile.value.hasTouch));

  return {
    tokens: breakpoints,
    profile,
    isMobile,
    isTablet,
    isDesktop,
    isTouch,
  };
}
