<script setup vapor lang="ts">
import { onBeforeUnmount, useId } from "vue";

import { Button, Modal } from "@daopk/ui";

const DIALOG_CONTENT_BASE_Z_INDEX = 1601;
const modalId = `finder-delete-${useId()}`;
const modalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" as const },
};
const modalOverlayProps = {
  color: "color-mix(in oklab, var(--color-bg) 60%, transparent)",
};

onBeforeUnmount(() => {
  const portalRoot = document.getElementById(modalId)?.parentElement;
  queueMicrotask(() => portalRoot?.remove());
});

defineProps<{
  readonly description: string;
  readonly loading: boolean;
  readonly open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <Modal
    :id="modalId"
    :open="open"
    title="Move item to Trash?"
    :description="description"
    size="420px"
    :base-z-index="DIALOG_CONTENT_BASE_Z_INDEX"
    close-on-overlay-click
    close-on-escape
    :show-close-button="false"
    :focus-trap-options="modalFocusTrapOptions"
    :overlay-props="modalOverlayProps"
    @close="emit('cancel')"
  >
    <template #footer>
      <div class="finder__dialog-actions">
        <Button size="sm" :disabled="loading" @click="emit('cancel')">Cancel</Button>
        <Button size="sm" variant="solid" color="blue" :loading="loading" @click="emit('confirm')">
          Move to Trash
        </Button>
      </div>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.finder__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  inline-size: 100%;
  justify-content: flex-end;
}
</style>
