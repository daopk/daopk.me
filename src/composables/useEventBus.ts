import { useKernel } from "~/composables/useKernel";

export function useEventBus() {
  const kernelInstance = useKernel();

  return {
    bus: kernelInstance.events,
  };
}
