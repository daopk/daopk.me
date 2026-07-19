<script setup vapor lang="ts">
import { Modal, Radio, RadioGroup } from "@daopk/ui";

defineProps<{
  readonly currentPage: number;
  readonly open: boolean;
  readonly pageOptions: readonly number[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  selectPage: [page: number];
}>();

const pageRadioClassNames = {
  indicator: "pdf-viewer__page-sheet-indicator",
  label: "pdf-viewer__page-sheet-label",
} as const;

function selectPage(value: string | number | null): void {
  if (value === null) return;
  emit("selectPage", Number(value));
}
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
    <RadioGroup
      class="pdf-viewer__page-sheet-list"
      :model-value="currentPage"
      aria-label="PDF pages"
      @update:model-value="selectPage"
    >
      <Radio
        v-for="page in pageOptions"
        :key="page"
        class="pdf-viewer__page-sheet-item"
        :class="{ 'pdf-viewer__page-sheet-item--active': page === currentPage }"
        :value="page"
        :class-names="pageRadioClassNames"
      >
        <span>Page {{ page }}</span>
      </Radio>
    </RadioGroup>
  </Modal>
</template>

<style scoped>
:deep(.pdf-viewer__page-sheet-indicator) {
  display: none;
}

:deep(.pdf-viewer__page-sheet-label) {
  display: contents;
}

.pdf-viewer__page-sheet-item:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
