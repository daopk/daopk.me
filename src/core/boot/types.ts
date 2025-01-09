import type { Kernel } from "~/types/kernel";

export type { BootStatus } from "~/types/kernel";

export interface BootPhase {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly run: (ctx: BootContext) => Promise<void>;
}

export interface BootContext {
  kernel: Kernel;
  /** Cancels phased work cleanly on HMR teardown. */
  readonly signal: AbortSignal;
}
