import type { Kernel } from "~/types/kernel";

import { kernel as kernelSingleton } from "~/core/kernel";

export type { Kernel } from "~/types/kernel";

export * from "~/core/boot/index";
export * from "~/core/devices/index";
export * from "~/core/ipc/index";
export * from "~/core/shortcuts/index";
export * from "~/core/storage/index";
export * from "~/core/telemetry/index";
export * from "~/core/theme/index";

export function bootstrapKernel(): Kernel {
  return kernelSingleton;
}
