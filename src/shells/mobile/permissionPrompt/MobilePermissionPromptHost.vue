<script setup lang="ts">
import { computed } from "vue";

import { Button, Dialog } from "~/components/ui";
import { usePermissionPromptQueue } from "~/composables/usePermissionPromptQueue";
import { permissionLabel } from "~/core/permissions/copy";

const queue = usePermissionPromptQueue();

const isOpen = computed(() => queue.current.value !== null);

const headline = computed(() => {
  const vm = queue.current.value;
  if (!vm) return "";
  const appName = vm.manifest?.name ?? vm.request.manifestId;
  return `${appName} wants to ${permissionLabel(vm.request.permission)}.`;
});

const description = computed(() => {
  const vm = queue.current.value;
  if (!vm) return undefined;
  if (queue.pendingCount.value > 1) {
    const remaining = queue.pendingCount.value - 1;
    return `You can change this later in Settings → Privacy. ${remaining} more pending.`;
  }
  return "You can change this later in Settings → Privacy.";
});

function onAllowOnce(): void {
  queue.respond({ granted: true, persist: false });
}

function onAllowRemember(): void {
  queue.respond({ granted: true, persist: true });
}

function onDeny(): void {
  queue.respond({ granted: false, persist: true });
}
</script>

<template>
  <Dialog
    :open="isOpen"
    :title="headline"
    :description="description"
    variant="sheet"
    :dismissible="false"
  >
    <div class="ds-permission-prompt-mobile__actions">
      <Button variant="primary" @click="onAllowRemember">Allow and remember</Button>
      <Button variant="secondary" @click="onAllowOnce">Allow once</Button>
      <Button variant="secondary" @click="onDeny">Don't allow</Button>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.ds-permission-prompt-mobile__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-block-start: var(--space-md);

  :deep(.ds-button) {
    justify-content: center;
    inline-size: 100%;
  }
}
</style>
