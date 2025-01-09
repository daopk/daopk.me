import { computed, type ComputedRef } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

export interface HomeScreenSlot {
  readonly manifest: AppManifest;
}

export interface UseHomeScreenGrid {
  readonly slots: ComputedRef<HomeScreenSlot[]>;
}

const HIDDEN_PREFIX = "_";

export function useHomeScreenGrid(kernel: Kernel): UseHomeScreenGrid {
  const manifests = kernel.apps
    .list()
    .filter((manifest) => !manifest.id.startsWith(HIDDEN_PREFIX) && manifest.hidden !== true);

  const slots = computed<HomeScreenSlot[]>(() => manifests.map((manifest) => ({ manifest })));

  return { slots };
}
