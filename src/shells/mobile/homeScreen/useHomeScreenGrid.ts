import { computed, onUnmounted, shallowRef, type ComputedRef } from "vue";

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
  const manifests = shallowRef<readonly AppManifest[]>(visibleManifests(kernel));

  function refresh(): void {
    manifests.value = visibleManifests(kernel);
  }

  const stopRegistered = kernel.events.on("app.registered", refresh);
  const stopUnregistered = kernel.events.on("app.unregistered", refresh);

  onUnmounted(() => {
    stopRegistered();
    stopUnregistered();
  });

  const slots = computed<HomeScreenSlot[]>(() => manifests.value.map((manifest) => ({ manifest })));

  return { slots };
}

function visibleManifests(kernel: Kernel): AppManifest[] {
  return kernel.apps
    .list()
    .filter((manifest) => !manifest.id.startsWith(HIDDEN_PREFIX) && manifest.hidden !== true);
}
