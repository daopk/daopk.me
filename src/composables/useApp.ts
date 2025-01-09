import { useKernel } from "~/composables/useKernel";

import type { AppManifest } from "~/types/app";

export function useApp() {
  const kernelInstance = useKernel();

  return {
    launch: (id: string, args?: Record<string, unknown>) => kernelInstance.apps.launch(id, args),
    list: (filter?: { category?: AppManifest["category"] }) => kernelInstance.apps.list(filter),
    unregister: (id: string) => {
      kernelInstance.apps.unregister(id);
    },
    register(manifest: AppManifest): void {
      kernelInstance.apps.register(manifest);
    },
  };
}
