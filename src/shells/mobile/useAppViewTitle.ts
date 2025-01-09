import { useKernel } from "~/composables/useKernel";

export interface UseAppViewTitle {
  titleFor(manifestId: string): string;
}

export function useAppViewTitle(): UseAppViewTitle {
  const kernel = useKernel();

  function titleFor(manifestId: string): string {
    const manifest = kernel.apps.list().find((m) => m.id === manifestId);
    return manifest?.name ?? manifestId;
  }

  return { titleFor };
}
