import { onMounted, onUnmounted, ref, type Ref } from "vue";

import { useKernel } from "~/composables/useKernel";
import type { AppManifest } from "~/types/app";
import type { PermissionRequest, PermissionResponseInput } from "~/types/permissions";

export interface PromptViewModel {
  readonly request: PermissionRequest;
  readonly manifest: AppManifest | undefined;
}

export interface PermissionPromptQueue {
  readonly current: Ref<PromptViewModel | null>;
  readonly pendingCount: Ref<number>;
  respond(response: PermissionResponseInput): void;
}

export function usePermissionPromptQueue(): PermissionPromptQueue {
  const kernel = useKernel();

  const queue: PromptViewModel[] = [];
  const current = ref<PromptViewModel | null>(null);
  const pendingCount = ref(0);

  function advance(): void {
    current.value = queue.shift() ?? null;
    pendingCount.value = queue.length + (current.value ? 1 : 0);
  }

  let stop: undefined | (() => void);

  onMounted(() => {
    stop = kernel.events.on("permission.requested", (payload) => {
      const manifest = kernel.apps.list().find((m) => m.id === payload.manifestId);
      const vm: PromptViewModel = {
        request: {
          requestId: payload.requestId,
          manifestId: payload.manifestId,
          permission: payload.permission,
          source: payload.source,
        },
        manifest,
      };

      if (current.value === null) {
        current.value = vm;
        pendingCount.value = 1;
      } else {
        queue.push(vm);
        pendingCount.value = queue.length + 1;
      }
    });
  });

  onUnmounted(() => {
    stop?.();
    stop = undefined;
    queue.length = 0;
    current.value = null;
    pendingCount.value = 0;
  });

  function respond(response: PermissionResponseInput): void {
    const head = current.value;
    if (head === null) return;
    kernel.permissions.respond(head.request.requestId, response);
    advance();
  }

  return { current, pendingCount, respond };
}
