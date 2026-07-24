<script setup vapor lang="ts">
import { onBeforeUnmount, useId } from "vue";

import { Button, Modal } from "@daopk/ui";

import type {
  FinderDeleteConfirmationState,
  FinderSessionIntent,
} from "../composables/useFinderSession";

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
  readonly state: FinderDeleteConfirmationState;
}>();

const emit = defineEmits<{
  intent: [intent: FinderSessionIntent];
}>();
</script>

<template>
  <Modal
    :id="modalId"
    :open="state.open"
    title="Move item to Trash?"
    :description="state.description"
    size="420px"
    :base-z-index="DIALOG_CONTENT_BASE_Z_INDEX"
    close-on-overlay-click
    close-on-escape
    :show-close-button="false"
    :focus-trap-options="modalFocusTrapOptions"
    :overlay-props="modalOverlayProps"
    @close="emit('intent', { type: 'cancel-delete' })"
  >
    <template #footer>
      <div class="finder__dialog-actions">
        <Button
          size="sm"
          :disabled="state.loading"
          @click="emit('intent', { type: 'cancel-delete' })"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="solid"
          color="blue"
          :loading="state.loading"
          @click="emit('intent', { type: 'confirm-delete' })"
        >
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
