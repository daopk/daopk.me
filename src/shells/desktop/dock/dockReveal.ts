import { reactive, readonly } from "vue";

export interface DockRevealRect {
  /** Viewport top of the dock element (CSS px). */
  top: number;
  /** Dock element height (CSS px). */
  height: number;
}

export interface DockRevealRegistration {
  /**
   * Whether the dock currently occupies stage layout — pinned, or revealed
   * while auto-hidden. When false, maximized windows fill the whole stage.
   */
  occupiesStage: boolean;
  /** Live-measures the dock element's viewport rect (null when unmounted). */
  measure: () => DockRevealRect | null;
}

interface DockRevealState {
  /** A dock is mounted and has registered itself. */
  present: boolean;
  occupiesStage: boolean;
}

const state = reactive<DockRevealState>({ present: false, occupiesStage: false });
let measureFn: (() => DockRevealRect | null) | null = null;

/**
 * Reactive view of dock occupancy for the window host. The host reads
 * `present`/`occupiesStage` to decide whether maximize must stop above the dock,
 * then calls {@link measureDockReveal} for live geometry — so it never has to
 * reach into the dock's DOM or class names.
 */
export const dockReveal = readonly(state);

/** Called by the dock whenever its occupancy changes. */
export function setDockReveal(registration: DockRevealRegistration): void {
  state.present = true;
  state.occupiesStage = registration.occupiesStage;
  measureFn = registration.measure;
}

/** Called by the dock on unmount so the host stops accounting for it. */
export function clearDockReveal(): void {
  state.present = false;
  state.occupiesStage = false;
  measureFn = null;
}

/** Live-measures the registered dock element, or null when none is present. */
export function measureDockReveal(): DockRevealRect | null {
  return measureFn?.() ?? null;
}
