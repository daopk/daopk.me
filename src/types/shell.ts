import type { Component } from "vue";

export type ShellId = "desktop" | "mobile";

export type PointerCoarse = "fine" | "coarse" | undefined;

export interface DeviceProfile {
  formFactor: "mobile" | "tablet" | "desktop";
  hasTouch?: boolean;
  hasHover?: boolean;
  pointerCoarse?: PointerCoarse;
  prefersReducedMotion?: boolean;
  prefersColorScheme?: "light" | "dark";
  viewportWidth?: number;
  viewportHeight?: number;
}

export type ShellComponent = Component;
