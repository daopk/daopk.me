<script setup lang="ts">
import { computed, watch, type ComponentPublicInstance } from "vue";

import { EmptyState, Spinner } from "@daopk/kit";
import { useVfs, type AppPreviewInput, type AppPreviewSurface } from "@daopk/sdk";

import { usePdfViewer } from "../usePdfViewer";

const props = defineProps<{
  readonly input: AppPreviewInput;
  readonly args: Readonly<Record<string, unknown>>;
  readonly surface: AppPreviewSurface;
}>();

const vfs = useVfs();
const previewPath = computed(() =>
  props.input.kind === "vfs-file" && props.input.entry.kind === "file"
    ? props.input.entry.path
    : null,
);
const viewer = usePdfViewer({
  vfs,
  initialPath: previewPath.value ?? undefined,
});
const busy = computed(
  () => viewer.status.value === "loading" || viewer.status.value === "rendering",
);
const readyWithPages = computed(
  () => viewer.status.value === "ready" && viewer.pageCount.value > 0,
);

watch(
  previewPath,
  (nextPath, previousPath) => {
    if (nextPath === null || nextPath === previousPath) {
      return;
    }

    void viewer.loadFromPath(nextPath);
  },
  { flush: "post" },
);

function setViewportRef(el: Element | ComponentPublicInstance | null): void {
  viewer.viewportEl.value = el instanceof HTMLElement ? el : null;
}

function setCanvasRef(el: Element | ComponentPublicInstance | null): void {
  viewer.canvasEl.value = el instanceof HTMLCanvasElement ? el : null;
}
</script>

<template>
  <section class="pdf-file-preview" :data-preview-surface="surface" aria-label="PDF preview">
    <EmptyState
      v-if="previewPath === null"
      class="pdf-file-preview__state"
      title="Preview unavailable"
      description="Select a PDF file to preview it."
    />
    <div v-else :ref="setViewportRef" class="pdf-file-preview__viewport">
      <div v-if="busy" class="pdf-file-preview__state" role="status" aria-live="polite">
        <Spinner />
        <span>{{ viewer.message.value }}</span>
      </div>
      <EmptyState
        v-else-if="viewer.status.value === 'error'"
        class="pdf-file-preview__state"
        role="alert"
        :title="viewer.error.value"
      />
      <EmptyState
        v-else-if="viewer.status.value === 'ready' && viewer.pageCount.value === 0"
        class="pdf-file-preview__state"
        :title="viewer.message.value"
      />
      <div v-show="readyWithPages" class="pdf-file-preview__page">
        <canvas :ref="setCanvasRef" class="pdf-file-preview__canvas" aria-label="First PDF page" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.pdf-file-preview {
  block-size: 100%;
  display: flex;
  inline-size: 100%;
  min-block-size: 220px;
  min-inline-size: 0;
}

.pdf-file-preview__viewport {
  align-items: start;
  background: var(--color-bg-subtle);
  block-size: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  inline-size: 100%;
  justify-items: center;
  min-block-size: 220px;
  min-inline-size: 0;
  overflow: auto;
  padding: var(--space-md);
}

.pdf-file-preview__state {
  align-self: stretch;
  block-size: 100%;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  min-block-size: 180px;
}

.pdf-file-preview__page {
  display: grid;
  justify-items: center;
  min-inline-size: 0;
}

.pdf-file-preview__canvas {
  background: white;
  box-shadow: 0 12px 32px color-mix(in srgb, black 16%, transparent);
  display: block;
  max-inline-size: 100%;
}
</style>
