import { computed, onUnmounted, readonly, ref, type ComputedRef, type Ref } from "vue";

import { useKernel } from "~/composables/useKernel";
import { createBaselineProfile } from "~/core/devices";
import { peekShellStickyOverride, pickShell } from "~/shells/shellRegistry";
import type { ShellId } from "~/types/shell";

interface ActiveShellComposable {
  readonly shellId: Readonly<Ref<ShellId>>;
  readonly isDesktop: ComputedRef<boolean>;
  readonly isMobile: ComputedRef<boolean>;
}

function resolveActiveShell(): ShellId {
  return pickShell(createBaselineProfile(), peekShellStickyOverride()).shellId;
}

export function useActiveShell(): ActiveShellComposable {
  const kernel = useKernel();
  const shellId = ref<ShellId>(resolveActiveShell());

  const refreshFromDevice = (): void => {
    shellId.value = resolveActiveShell();
  };

  const stopShellListener = kernel.events.on("shell.changed", (payload) => {
    shellId.value = payload.shellId;
  });

  if (typeof window !== "undefined") {
    window.addEventListener("resize", refreshFromDevice);
  }

  onUnmounted(() => {
    stopShellListener();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", refreshFromDevice);
    }
  });

  return {
    shellId: readonly(shellId),
    isDesktop: computed(() => shellId.value === "desktop"),
    isMobile: computed(() => shellId.value === "mobile"),
  };
}
