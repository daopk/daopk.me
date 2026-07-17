<script setup vapor lang="ts">
import { Modal } from "@daopk/ui";

defineProps<{
  readonly currentPage: number;
  readonly open: boolean;
  readonly pageOptions: readonly number[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  selectPage: [page: number];
}>();
</script>

<template>
  <Modal
    :open="open"
    title="Select page"
    :show-close-button="false"
    :class-names="{
      panel: 'pdf-viewer__page-sheet-panel',
      body: 'pdf-viewer__page-sheet-body',
    }"
    @update:open="emit('update:open', $event)"
  >
    <div class="pdf-viewer__page-sheet-list" role="listbox" aria-label="PDF pages">
      <button
        v-for="page in pageOptions"
        :key="page"
        type="button"
        class="pdf-viewer__page-sheet-item"
        :class="{ 'pdf-viewer__page-sheet-item--active': page === currentPage }"
        role="option"
        :aria-selected="page === currentPage"
        @click="emit('selectPage', page)"
      >
        <span>Page {{ page }}</span>
      </button>
    </div>
  </Modal>
</template>
