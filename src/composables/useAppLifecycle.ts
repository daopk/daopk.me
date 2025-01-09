import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from "vue";

import type { LifecyclePhase } from "~/core/kernel/Lifecycle";
import { useKernel } from "~/composables/useKernel";

const ALL_PHASES: readonly LifecyclePhase[] = [
  "created",
  "mounted",
  "activated",
  "deactivated",
  "suspended",
  "resumed",
  "destroyed",
];

export interface UseAppLifecycleReturn {
  phase: ComputedRef<LifecyclePhase | null>;
  isActive: ComputedRef<boolean>;
  isSuspended: ComputedRef<boolean>;
  onPhase(_phase: LifecyclePhase, _callback: () => void): () => void;
}

export function useAppLifecycle(
  handleIdSource: MaybeRefOrGetter<string | null | undefined>,
): UseAppLifecycleReturn {
  const kernel = useKernel();

  const phaseRef = ref<LifecyclePhase | null>(null);
  const userListeners = new Map<LifecyclePhase, Set<() => void>>();
  let activeDisposers: Array<() => void> = [];

  function teardown(): void {
    for (const dispose of activeDisposers) {
      dispose();
    }
    activeDisposers = [];
    phaseRef.value = null;
  }

  function setupForHandle(handleId: string): void {
    teardown();
    for (const phase of ALL_PHASES) {
      const dispose = kernel.lifecycleCoordinator.on(phase, handleId, () => {
        phaseRef.value = phase;
        const bucket = userListeners.get(phase);
        if (!bucket) {
          return;
        }
        for (const cb of Array.from(bucket)) {
          cb();
        }
      });
      activeDisposers.push(dispose);
    }
  }

  watch(
    () => toValue(handleIdSource),
    (handleId) => {
      if (typeof handleId === "string" && handleId.length > 0) {
        setupForHandle(handleId);
      } else {
        teardown();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    teardown();
    userListeners.clear();
  });

  function onPhase(phase: LifecyclePhase, callback: () => void): () => void {
    let bucket = userListeners.get(phase);
    if (!bucket) {
      bucket = new Set();
      userListeners.set(phase, bucket);
    }
    bucket.add(callback);
    return (): void => {
      const live = userListeners.get(phase);
      live?.delete(callback);
    };
  }

  return {
    phase: computed(() => phaseRef.value),
    isActive: computed(() => phaseRef.value === "activated"),
    isSuspended: computed(() => phaseRef.value === "suspended"),
    onPhase,
  };
}
