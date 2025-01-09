import { ref, type Ref } from "vue";

import { matchBreakpoint } from "~/core/devices/breakpoints";
import { getSystemPreference, subscribeSystemPreference } from "~/core/theme/systemPreference";
import type { DeviceProfile, PointerCoarse } from "~/types/shell";

export function createBaselineProfile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  const width =
    typeof globalThis.visualViewport?.width === "number"
      ? globalThis.visualViewport.width
      : typeof globalThis.innerWidth === "number"
        ? globalThis.innerWidth
        : undefined;

  const formFactor = typeof width === "number" ? matchBreakpoint(width) : ("desktop" as const);

  return {
    formFactor,
    prefersReducedMotion:
      typeof globalThis.matchMedia === "function"
        ? globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
        : undefined,
    prefersColorScheme:
      typeof globalThis.matchMedia === "function" ? getSystemPreference() : undefined,
    hasHover:
      typeof globalThis.matchMedia === "function"
        ? globalThis.matchMedia("(hover: hover)").matches
        : undefined,
    hasTouch: typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 ? true : undefined,
    pointerCoarse: probePointerCoarse(),
    viewportWidth: width,
    viewportHeight:
      typeof globalThis.visualViewport?.height === "number"
        ? globalThis.visualViewport.height
        : typeof globalThis.innerHeight === "number"
          ? globalThis.innerHeight
          : undefined,
    ...overrides,
  };
}

function probePointerCoarse(): PointerCoarse {
  if (typeof globalThis.matchMedia !== "function") {
    return undefined;
  }

  if (globalThis.matchMedia("(pointer: coarse)").matches) {
    return "coarse";
  }

  return globalThis.matchMedia("(pointer: fine)").matches ? "fine" : undefined;
}

function mergeLiveProfile(): DeviceProfile {
  const base = createBaselineProfile();
  const width = base.viewportWidth;
  const formFactor = typeof width === "number" ? matchBreakpoint(width) : base.formFactor;

  return { ...base, formFactor };
}

export interface WatchDeviceProfileHandle {
  readonly profile: Ref<DeviceProfile>;
  dispose(): void;
}

/** Reactive profile stream — callers must dispose on teardown (see `useBreakpoint`). */
export function watchDeviceProfile(): WatchDeviceProfileHandle {
  const profile = ref<DeviceProfile>(mergeLiveProfile());

  const update = (): void => {
    profile.value = mergeLiveProfile();
  };

  const onResize = (): void => {
    update();
  };

  window.addEventListener("resize", onResize);

  const motion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const pointerFine = globalThis.matchMedia?.("(pointer: fine)");
  const pointerCoarse = globalThis.matchMedia?.("(pointer: coarse)");
  const hoverCapable = globalThis.matchMedia?.("(hover: hover)");

  const disposeOsColorSchemeProbe = subscribeSystemPreference((): void => {
    update();
  });

  motion?.addEventListener("change", update);
  pointerFine?.addEventListener("change", update);
  pointerCoarse?.addEventListener("change", update);
  hoverCapable?.addEventListener("change", update);

  return {
    profile,
    dispose(): void {
      window.removeEventListener("resize", onResize);
      disposeOsColorSchemeProbe();

      motion?.removeEventListener("change", update);
      pointerFine?.removeEventListener("change", update);
      pointerCoarse?.removeEventListener("change", update);
      hoverCapable?.removeEventListener("change", update);
    },
  };
}
