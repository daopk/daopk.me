<script setup lang="ts">
import { Button } from "@daopk/ui";
import { EmptyState, ScrollArea, Spinner } from "@daopk/kit";
import { Upload } from "@daopk/icons";

import type { PdfViewerBindings } from "../usePdfViewer";

defineProps<{
  readonly hasDocument: boolean;
  readonly setCanvasRef: (el: unknown) => void;
  readonly setViewportRef: (el: unknown) => void;
  readonly viewer: PdfViewerBindings;
}>();

const emit = defineEmits<{
  open: [];
}>();
</script>

<template>
  <ScrollArea
    :ref="setViewportRef"
    as="main"
    axis="both"
    class="pdf-viewer__viewport"
    :class="{ 'pdf-viewer__viewport--empty': !hasDocument }"
  >
    <EmptyState
      v-if="viewer.status.value === 'idle'"
      class="pdf-viewer__empty pdf-viewer__empty--idle"
    >
      <Button variant="primary" :icon-start="Upload" @click="emit('open')">Choose file</Button>
    </EmptyState>

    <EmptyState
      v-else-if="viewer.status.value === 'loading'"
      class="pdf-viewer__empty"
      title="Loading..."
    >
      <template #icon>
        <Spinner />
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="viewer.status.value === 'error'"
      class="pdf-viewer__empty"
      role="alert"
      :title="viewer.error.value ?? undefined"
    >
      <Button variant="primary" :icon-start="Upload" @click="emit('open')">Choose file</Button>
    </EmptyState>

    <EmptyState
      v-else-if="viewer.status.value === 'ready' && !hasDocument"
      class="pdf-viewer__empty"
      :title="viewer.message.value"
    />

    <div v-show="hasDocument" class="pdf-viewer__page">
      <canvas :ref="setCanvasRef" class="pdf-viewer__canvas" aria-label="PDF page" />
    </div>
  </ScrollArea>
</template>
