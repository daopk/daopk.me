import type { InjectionKey } from "vue";

/**
 * Provided by {@link AppMount} so the error fallback can re-attempt loading the
 * app module. `null` when no retry is meaningful (e.g. unknown manifest), which
 * lets the fallback hide its retry affordance.
 */
export const AppMountRetryKey: InjectionKey<(() => void) | null> = Symbol("app-mount-retry");
