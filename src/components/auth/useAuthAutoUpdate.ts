import { computed, watch, type ComputedRef, type Ref } from "vue";

import { serviceWorkerUpdateController } from "~/service-worker/updateController";

export interface AuthAutoUpdateState {
  readonly visible: ComputedRef<boolean>;
  readonly updating: ComputedRef<boolean>;
  readonly failed: ComputedRef<boolean>;
  readonly errorMessage: ComputedRef<string>;
  retry(): void;
}

export function useAuthAutoUpdate(enabled: Readonly<Ref<boolean>>): AuthAutoUpdateState {
  const state = serviceWorkerUpdateController.state;

  const visible = computed(
    () =>
      enabled.value &&
      (state.value.kind === "update-available" || state.value.kind === "refresh-error"),
  );
  const updating = computed(() => enabled.value && state.value.kind === "update-available");
  const failed = computed(() => enabled.value && state.value.kind === "refresh-error");
  const errorMessage = computed(() =>
    state.value.kind === "refresh-error" ? state.value.message : "",
  );

  function refreshPendingUpdate(): void {
    if (!enabled.value || state.value.kind !== "update-available" || state.value.refreshing) {
      return;
    }

    void serviceWorkerUpdateController.refresh();
  }

  watch(() => [enabled.value, state.value] as const, refreshPendingUpdate, { immediate: true });

  return {
    visible,
    updating,
    failed,
    errorMessage,
    retry: () => {
      void serviceWorkerUpdateController.refresh();
    },
  };
}
