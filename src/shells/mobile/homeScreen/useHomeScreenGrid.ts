import { computed, type ComputedRef } from "vue";

import { appSupportsShell, appUnsupportedShellMessage } from "~/core/apps/shellSupport";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

export interface HomeScreenSlot {
  readonly manifest: AppManifest;
  readonly unsupported: boolean;
  readonly unavailableReason?: string;
}

export interface UseHomeScreenGrid {
  readonly slots: ComputedRef<HomeScreenSlot[]>;
}

const HIDDEN_PREFIX = "_";

export function useHomeScreenGrid(kernel: Kernel): UseHomeScreenGrid {
  const manifests = kernel.apps
    .list()
    .filter((manifest) => !manifest.id.startsWith(HIDDEN_PREFIX) && manifest.hidden !== true);

  const slots = computed<HomeScreenSlot[]>(() =>
    manifests.map((manifest) => {
      const unsupported = !appSupportsShell(manifest, "mobile");

      return {
        manifest,
        unsupported,
        ...(unsupported
          ? { unavailableReason: appUnsupportedShellMessage(manifest, "mobile") }
          : {}),
      };
    }),
  );

  return { slots };
}
