import { ref } from "vue";

export function useMobileLaunchState() {
  const lastLaunchedManifestId = ref<string | null>(null);
  const launchingManifestIds = ref<ReadonlySet<string>>(new Set<string>());

  function addLaunching(manifestId: string): void {
    const next = new Set(launchingManifestIds.value);
    next.add(manifestId);
    launchingManifestIds.value = next;
  }

  function clearLaunching(manifestId: string): void {
    if (!launchingManifestIds.value.has(manifestId)) {
      return;
    }
    const next = new Set(launchingManifestIds.value);
    next.delete(manifestId);
    launchingManifestIds.value = next;
  }

  function commitLaunched(manifestId: string): void {
    lastLaunchedManifestId.value = manifestId;
  }

  return {
    addLaunching,
    clearLaunching,
    commitLaunched,
    lastLaunchedManifestId,
    launchingManifestIds,
  };
}
