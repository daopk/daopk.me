import { inject } from "vue";

import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

export function useKernel(): Kernel {
  const injected = inject(KernelInjectionKey, undefined);

  if (!injected) {
    throw new Error(
      "useKernel(): KernelInjectionKey missing — bootstrapKernel must run before mount.",
    );
  }

  return injected;
}
