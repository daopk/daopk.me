<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ScrollArea,
  Separator,
  Spinner,
  StatusBanner,
  TextInput,
  ToolbarGroup,
  ToolbarTitle,
} from "@daopk/kit";
import { Button } from "@daopk/ui";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  RotateCw,
  Upload,
  ZoomIn,
  ZoomOut,
} from "@daopk/icons";
import { AppContextInjectionKey, normalizeVfsPath, useKernel, useVfs } from "@daopk/sdk";

import { usePdfViewer } from "./usePdfViewer";

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();
const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : undefined;
const viewer = usePdfViewer({
  vfs,
  initialPath,
});

const fileInput = ref<HTMLInputElement | null>(null);
const pageDraft = ref("1");

const hasDocument = computed(() => viewer.pageCount.value > 0);
const showChrome = computed(() => viewer.sourceKind.value !== "empty");
const busy = computed(
  () => viewer.status.value === "loading" || viewer.status.value === "rendering",
);
const sourceLabel = computed(() => {
  if (viewer.sourceKind.value === "vfs" && viewer.path.value !== null) {
    return viewer.path.value;
  }

  if (viewer.sourceKind.value === "file") {
    return "Local file";
  }

  return "No document";
});

watch(
  viewer.pageNumber,
  (next) => {
    pageDraft.value = next > 0 ? String(next) : "";
  },
  { immediate: true },
);

watch(
  viewer.path,
  () => {
    emitDocumentPath(normalizeDocumentPath(viewer.path.value));
  },
  { immediate: true },
);

function normalizeDocumentPath(path: string | null | undefined): string | null {
  if (path === null || path === undefined) {
    return null;
  }
  try {
    return normalizeVfsPath(path);
  } catch {
    return null;
  }
}

function emitDocumentPath(path: string | null): void {
  if (ctx === null) {
    return;
  }

  kernel.events.emit("app.document.changed", {
    manifestId: ctx.manifestId,
    handleId: ctx.handleId,
    path,
  });
}

function openFilePicker(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) {
    void viewer.loadFromFile(file);
  }
  input.value = "";
}

function submitPage(): void {
  const nextPage = Number(pageDraft.value);
  if (!Number.isFinite(nextPage) || !viewer.setPage(nextPage)) {
    pageDraft.value = viewer.pageNumber.value > 0 ? String(viewer.pageNumber.value) : "";
  }
}

function goPrevious(): void {
  viewer.goPrevious();
}

function goNext(): void {
  viewer.goNext();
}

function zoomIn(): void {
  viewer.zoomIn();
}

function zoomOut(): void {
  viewer.zoomOut();
}

function fitWidth(): void {
  void viewer.fitWidth();
}

function rotateClockwise(): void {
  viewer.rotateClockwise();
}

function download(): void {
  viewer.download();
}

function setViewportRef(el: unknown): void {
  const node =
    el !== null && typeof el === "object" && "element" in el
      ? (el as { element: HTMLElement | null }).element
      : el;
  viewer.viewportEl.value = node instanceof HTMLElement ? node : null;
}

function setCanvasRef(el: unknown): void {
  viewer.canvasEl.value = el instanceof HTMLCanvasElement ? el : null;
}
</script>

<template>
  <AppFrame class="pdf-viewer" layout="flex-column" aria-label="PDF Viewer">
    <input
      ref="fileInput"
      class="pdf-viewer__file-input"
      type="file"
      accept="application/pdf,.pdf"
      @change="onFileChange"
    />

    <AppToolbar v-if="showChrome" class="pdf-viewer__toolbar" wrap>
      <template #start>
        <ToolbarTitle
          class="pdf-viewer__document"
          :title="viewer.title.value || sourceLabel"
          :subtitle="viewer.title.value ? sourceLabel : undefined"
        />
      </template>

      <template #end>
        <div class="pdf-viewer__controls" aria-label="PDF controls">
          <ToolbarGroup label="Document">
            <IconButton label="Open PDF" :icon="Upload" :disabled="busy" @click="openFilePicker" />
          </ToolbarGroup>

          <Separator orientation="vertical" decorative />

          <ToolbarGroup label="Pages">
            <IconButton
              label="Previous page"
              :icon="ChevronLeft"
              :disabled="!viewer.canGoPrevious.value || busy"
              @click="goPrevious"
            />
            <form class="pdf-viewer__page-form" @submit.prevent="submitPage">
              <label class="pdf-viewer__page-label" for="pdf-viewer-page">Page</label>
              <TextInput
                id="pdf-viewer-page"
                v-model="pageDraft"
                class="pdf-viewer__page-input"
                type="number"
                inputmode="numeric"
                min="1"
                :max="viewer.pageCount.value || undefined"
                :disabled="!hasDocument || busy"
                @blur="submitPage"
              />
              <span class="pdf-viewer__page-total">/ {{ viewer.pageCount.value || "-" }}</span>
            </form>
            <IconButton
              label="Next page"
              :icon="ChevronRight"
              :disabled="!viewer.canGoNext.value || busy"
              @click="goNext"
            />
          </ToolbarGroup>

          <Separator orientation="vertical" decorative />

          <ToolbarGroup label="Zoom and page tools">
            <IconButton
              label="Zoom out"
              :icon="ZoomOut"
              :disabled="!hasDocument || busy"
              @click="zoomOut"
            />
            <span class="pdf-viewer__zoom" aria-live="polite">{{ viewer.zoomLabel.value }}</span>
            <IconButton
              label="Zoom in"
              :icon="ZoomIn"
              :disabled="!hasDocument || busy"
              @click="zoomIn"
            />
            <IconButton
              label="Fit width"
              :icon="Maximize2"
              :disabled="!hasDocument || busy"
              @click="fitWidth"
            />
            <IconButton
              label="Rotate clockwise"
              :icon="RotateCw"
              :disabled="!hasDocument || busy"
              @click="rotateClockwise"
            />
            <IconButton
              label="Download PDF"
              :icon="Download"
              :disabled="!viewer.canDownload.value || busy"
              @click="download"
            />
          </ToolbarGroup>
        </div>
      </template>
    </AppToolbar>

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
        <Button variant="primary" :icon-start="Upload" @click="openFilePicker">Choose file</Button>
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
        <Button variant="primary" :icon-start="Upload" @click="openFilePicker">Choose file</Button>
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

    <StatusBanner v-if="showChrome" as="footer" class="pdf-viewer__status">
      {{ viewer.message.value }}
    </StatusBanner>
  </AppFrame>
</template>

<style scoped lang="scss">
.pdf-viewer {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: var(--font-size-sm);
  inline-size: 100%;
  min-block-size: 0;
}

.pdf-viewer__toolbar {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  min-block-size: 52px;
  min-inline-size: 0;
  padding-block: var(--space-xs);
  padding-inline-end: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-left, 0px));
}

.pdf-viewer__document {
  flex: 1 1 auto;
  min-inline-size: 150px;
}

.pdf-viewer__file-input,
.pdf-viewer__page-label {
  block-size: 1px;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.pdf-viewer__controls {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
}

.pdf-viewer__page-form {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
}

.pdf-viewer__page-input {
  inline-size: 54px;
  min-block-size: var(--control-height-sm);
  padding: 0 var(--space-xs);
  text-align: center;
}

.pdf-viewer__page-total,
.pdf-viewer__zoom {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  min-inline-size: 42px;
  text-align: center;
  white-space: nowrap;
}

.pdf-viewer__viewport {
  background:
    linear-gradient(
      45deg,
      color-mix(in srgb, var(--color-fg) 4%, transparent) 25%,
      transparent 25%
    ),
    linear-gradient(
      -45deg,
      color-mix(in srgb, var(--color-fg) 4%, transparent) 25%,
      transparent 25%
    ),
    linear-gradient(
      45deg,
      transparent 75%,
      color-mix(in srgb, var(--color-fg) 4%, transparent) 75%
    ),
    linear-gradient(
      -45deg,
      transparent 75%,
      color-mix(in srgb, var(--color-fg) 4%, transparent) 75%
    );
  background-color: var(--color-bg);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
  flex: 1 1 auto;
  min-block-size: 0;
}

.pdf-viewer__viewport--empty {
  align-items: center;
  background: var(--color-bg);
  display: grid;
  justify-items: center;
}

.pdf-viewer__empty {
  align-items: center;
  color: var(--color-fg-muted);
  display: grid;
  gap: var(--space-md);
  justify-items: center;
  padding: var(--space-xl);
  text-align: center;
}

.pdf-viewer__empty--idle {
  padding: var(--space-lg);
}

.pdf-viewer__page {
  display: grid;
  justify-content: center;
  min-block-size: 100%;
}

.pdf-viewer__canvas {
  background: white;
  box-shadow:
    0 18px 48px color-mix(in srgb, var(--color-fg) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-fg) 10%, transparent);
  display: block;
}

.pdf-viewer__status {
  background: var(--color-bg-subtle);
  border-block-start: 1px solid var(--color-border);
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  min-block-size: 28px;
  overflow: hidden;
  padding-block: var(--space-xs);
  padding-inline-end: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-left, 0px));
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .pdf-viewer__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .pdf-viewer__controls {
    flex-wrap: wrap;
  }

  .pdf-viewer__document {
    inline-size: 100%;
  }
}
</style>
