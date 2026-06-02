<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ScrollArea,
  Separator,
  Spinner,
  TextInput,
  ToolbarGroup,
  useAppChrome,
} from "@daopk/kit";
import { Button, Dialog, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@daopk/ui";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  MoveHorizontal,
  RotateCwSquare,
  Upload,
  ZoomIn,
  ZoomOut,
} from "@daopk/icons";
import { AppContextInjectionKey, normalizeVfsPath, useKernel, useVfs } from "@daopk/sdk";

import { usePdfViewer } from "./usePdfViewer";
import { usePdfViewerGestures } from "./usePdfViewerGestures";

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();
const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : undefined;
const viewer = usePdfViewer({
  vfs,
  initialPath,
});
usePdfViewerGestures(viewer.viewportEl, viewer);

const fileInput = ref<HTMLInputElement | null>(null);
const controlsEl = ref<HTMLElement | null>(null);
const pageDraft = ref("1");
const pageSheetOpen = ref(false);

const hasDocument = computed(() => viewer.pageCount.value > 0);
const showChrome = computed(() => viewer.sourceKind.value !== "empty");
const chromeTitle = computed(() => viewer.title.value || "PDF Viewer");
const pageSelectorLabel = computed(() => {
  const current = viewer.pageNumber.value > 0 ? viewer.pageNumber.value : "-";
  const total = viewer.pageCount.value || "-";
  return `${current} / ${total}`;
});
const pageOptions = computed(() =>
  Array.from({ length: viewer.pageCount.value }, (_, index) => index + 1),
);
const busy = computed(
  () => viewer.status.value === "loading" || viewer.status.value === "rendering",
);

const TOOLBAR_ACTION_IDS = ["open", "zoom", "fit", "rotate", "download"] as const;
type ToolbarActionId = (typeof TOOLBAR_ACTION_IDS)[number];

const TOOLBAR_ACTION_WIDTHS: Record<ToolbarActionId, number> = {
  open: 44,
  zoom: 134,
  fit: 44,
  rotate: 44,
  download: 44,
};
const PAGE_GROUP_FALLBACK_WIDTH = 196;
const MORE_BUTTON_WIDTH = 44;
const TOOLBAR_GAP_FALLBACK = 4;

const visibleToolbarActionIds = ref<readonly ToolbarActionId[]>(TOOLBAR_ACTION_IDS);
const overflowToolbarActionIds = computed(() =>
  TOOLBAR_ACTION_IDS.filter((id) => !visibleToolbarActionIds.value.includes(id)),
);
const hasOverflowToolbarActions = computed(() => overflowToolbarActionIds.value.length > 0);
const hasVisibleToolbarTools = computed(() =>
  (["zoom", "fit", "rotate", "download"] as const).some(isToolbarActionVisible),
);
const hasOverflowDocumentAction = computed(() => isToolbarActionOverflowed("open"));
const hasOverflowZoomAction = computed(() => isToolbarActionOverflowed("zoom"));
const hasOverflowPageToolAction = computed(() =>
  (["fit", "rotate", "download"] as const).some(isToolbarActionOverflowed),
);

let toolbarResizeObserver: ResizeObserver | null = null;
let observedControlsEl: HTMLElement | null = null;

useAppChrome({ title: chromeTitle });

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

function openPageSheet(): void {
  if (hasDocument.value && !busy.value) {
    pageSheetOpen.value = true;
  }
}

function selectPage(page: number): void {
  if (viewer.setPage(page)) {
    pageSheetOpen.value = false;
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

function isToolbarActionVisible(id: ToolbarActionId): boolean {
  return visibleToolbarActionIds.value.includes(id);
}

function isToolbarActionOverflowed(id: ToolbarActionId): boolean {
  return overflowToolbarActionIds.value.includes(id);
}

function readPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toolbarGapPx(): number {
  const el = controlsEl.value;
  if (el === null) {
    return TOOLBAR_GAP_FALLBACK;
  }
  const styles = window.getComputedStyle(el);
  return readPixelValue(styles.columnGap || styles.gap, TOOLBAR_GAP_FALLBACK);
}

function toolbarButtonWidthPx(): number {
  const button = controlsEl.value?.querySelector<HTMLButtonElement>(".ds-kit-icon-button");
  const width = button?.getBoundingClientRect().width ?? 0;
  return width > 0 ? Math.ceil(width) : MORE_BUTTON_WIDTH;
}

function pageGroupWidthPx(): number {
  const pageGroup = controlsEl.value?.querySelector<HTMLElement>(".pdf-viewer__page-group");
  const width = pageGroup?.getBoundingClientRect().width ?? 0;
  return width > 0 ? Math.ceil(width) : PAGE_GROUP_FALLBACK_WIDTH;
}

function toolbarInlineWidthFor(
  pageWidth: number,
  actionIds: readonly ToolbarActionId[],
  gap: number,
  reserveMore: boolean,
): number {
  const actionWidth = actionIds.reduce((sum, id) => sum + TOOLBAR_ACTION_WIDTHS[id], 0);
  const groupCount = 1 + actionIds.length + (reserveMore ? 1 : 0);
  return pageWidth + actionWidth + (reserveMore ? MORE_BUTTON_WIDTH : 0) + gap * (groupCount - 1);
}

function updateToolbarLayout(): void {
  const el = controlsEl.value;
  if (el === null) {
    visibleToolbarActionIds.value = TOOLBAR_ACTION_IDS;
    return;
  }

  const availableWidth = el.clientWidth;
  if (availableWidth <= 0) {
    visibleToolbarActionIds.value = TOOLBAR_ACTION_IDS;
    return;
  }

  const buttonWidth = toolbarButtonWidthPx();
  TOOLBAR_ACTION_WIDTHS.open = buttonWidth;
  TOOLBAR_ACTION_WIDTHS.fit = buttonWidth;
  TOOLBAR_ACTION_WIDTHS.rotate = buttonWidth;
  TOOLBAR_ACTION_WIDTHS.download = buttonWidth;

  const gap = toolbarGapPx();
  const pageWidth = pageGroupWidthPx();
  if (toolbarInlineWidthFor(pageWidth, TOOLBAR_ACTION_IDS, gap, false) <= availableWidth) {
    visibleToolbarActionIds.value = TOOLBAR_ACTION_IDS;
    return;
  }

  const nextVisible: ToolbarActionId[] = [];
  for (const id of ["zoom", "fit", "rotate", "download", "open"] as const) {
    const candidate = [...nextVisible, id];
    if (toolbarInlineWidthFor(pageWidth, candidate, gap, true) > availableWidth) {
      break;
    }
    nextVisible.push(id);
  }
  visibleToolbarActionIds.value = nextVisible;
}

function observeToolbarControls(): void {
  const nextEl = controlsEl.value;
  if (observedControlsEl === nextEl) {
    return;
  }

  toolbarResizeObserver?.disconnect();
  toolbarResizeObserver = null;
  observedControlsEl = nextEl;

  if (nextEl !== null && typeof ResizeObserver !== "undefined") {
    toolbarResizeObserver = new ResizeObserver(updateToolbarLayout);
    toolbarResizeObserver.observe(nextEl);
  }
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

function scheduleToolbarLayoutUpdate(): void {
  void nextTick(() => {
    observeToolbarControls();
    updateToolbarLayout();
  });
}

onMounted(() => {
  window.addEventListener("resize", updateToolbarLayout);
  scheduleToolbarLayoutUpdate();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateToolbarLayout);
  toolbarResizeObserver?.disconnect();
});

watch([showChrome, viewer.pageCount, viewer.zoomLabel], scheduleToolbarLayoutUpdate, {
  immediate: true,
});
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

    <AppToolbar v-if="showChrome" class="pdf-viewer__toolbar">
      <div ref="controlsEl" class="pdf-viewer__controls" aria-label="PDF controls">
        <ToolbarGroup
          v-if="isToolbarActionVisible('open')"
          class="pdf-viewer__document-group"
          label="Document"
        >
          <IconButton label="Open PDF" :icon="Upload" :disabled="busy" @click="openFilePicker" />
        </ToolbarGroup>

        <Separator
          v-if="isToolbarActionVisible('open')"
          class="pdf-viewer__toolbar-separator"
          orientation="vertical"
          decorative
        />

        <ToolbarGroup class="pdf-viewer__page-group" label="Pages">
          <IconButton
            label="Previous page"
            :icon="ChevronLeft"
            :disabled="!viewer.canGoPrevious.value || busy"
            @click="goPrevious"
          />
          <form
            class="pdf-viewer__page-form pdf-viewer__page-form--desktop"
            @submit.prevent="submitPage"
          >
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
          <button
            type="button"
            class="pdf-viewer__page-sheet-trigger"
            :disabled="!hasDocument || busy"
            :aria-label="`Select page ${pageSelectorLabel}`"
            @click="openPageSheet"
          >
            {{ pageSelectorLabel }}
          </button>
          <IconButton
            label="Next page"
            :icon="ChevronRight"
            :disabled="!viewer.canGoNext.value || busy"
            @click="goNext"
          />
        </ToolbarGroup>

        <Separator
          v-if="hasVisibleToolbarTools"
          class="pdf-viewer__toolbar-separator"
          orientation="vertical"
          decorative
        />

        <ToolbarGroup
          v-if="hasVisibleToolbarTools"
          class="pdf-viewer__tools-group"
          label="Zoom and page tools"
        >
          <IconButton
            v-if="isToolbarActionVisible('zoom')"
            label="Zoom out"
            :icon="ZoomOut"
            :disabled="!hasDocument || busy"
            @click="zoomOut"
          />
          <span v-if="isToolbarActionVisible('zoom')" class="pdf-viewer__zoom" aria-live="polite">{{
            viewer.zoomLabel.value
          }}</span>
          <IconButton
            v-if="isToolbarActionVisible('zoom')"
            label="Zoom in"
            :icon="ZoomIn"
            :disabled="!hasDocument || busy"
            @click="zoomIn"
          />
          <IconButton
            v-if="isToolbarActionVisible('fit')"
            label="Fit width"
            :icon="MoveHorizontal"
            :disabled="!hasDocument || busy"
            @click="fitWidth"
          />
          <IconButton
            v-if="isToolbarActionVisible('rotate')"
            label="Rotate clockwise"
            :icon="RotateCwSquare"
            :disabled="!hasDocument || busy"
            @click="rotateClockwise"
          />
          <IconButton
            v-if="isToolbarActionVisible('download')"
            label="Download PDF"
            :icon="Download"
            :disabled="!viewer.canDownload.value || busy"
            @click="download"
          />
        </ToolbarGroup>

        <ToolbarGroup
          v-if="hasOverflowToolbarActions"
          class="pdf-viewer__overflow-menu"
          label="More PDF tools"
        >
          <DropdownMenu align="end">
            <template #trigger>
              <IconButton label="More PDF tools" :icon="MoreHorizontal" :disabled="busy" />
            </template>

            <template #items>
              <DropdownMenuItem
                v-if="isToolbarActionOverflowed('open')"
                text-value="Open PDF"
                :disabled="busy"
                @select="openFilePicker"
              >
                <Upload class="ds-dropdown-menu__item-icon" aria-hidden="true" />
                <span>Open PDF</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator
                v-if="
                  hasOverflowDocumentAction && (hasOverflowZoomAction || hasOverflowPageToolAction)
                "
              />
              <DropdownMenuItem
                v-if="isToolbarActionOverflowed('zoom')"
                text-value="Zoom out"
                :disabled="!hasDocument || busy"
                @select="zoomOut"
              >
                <ZoomOut class="ds-dropdown-menu__item-icon" aria-hidden="true" />
                <span>Zoom out</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="isToolbarActionOverflowed('zoom')"
                text-value="Zoom in"
                :disabled="!hasDocument || busy"
                @select="zoomIn"
              >
                <ZoomIn class="ds-dropdown-menu__item-icon" aria-hidden="true" />
                <span>Zoom in</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="hasOverflowZoomAction && hasOverflowPageToolAction" />
              <DropdownMenuItem
                v-if="isToolbarActionOverflowed('fit')"
                text-value="Fit width"
                :disabled="!hasDocument || busy"
                @select="fitWidth"
              >
                <MoveHorizontal class="ds-dropdown-menu__item-icon" aria-hidden="true" />
                <span>Fit width</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="isToolbarActionOverflowed('rotate')"
                text-value="Rotate clockwise"
                :disabled="!hasDocument || busy"
                @select="rotateClockwise"
              >
                <RotateCwSquare class="ds-dropdown-menu__item-icon" aria-hidden="true" />
                <span>Rotate clockwise</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="isToolbarActionOverflowed('download')"
                text-value="Download PDF"
                :disabled="!viewer.canDownload.value || busy"
                @select="download"
              >
                <Download class="ds-dropdown-menu__item-icon" aria-hidden="true" />
                <span>Download PDF</span>
              </DropdownMenuItem>
            </template>
          </DropdownMenu>
        </ToolbarGroup>
      </div>
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

    <Dialog v-model:open="pageSheetOpen" title="Select page" variant="sheet">
      <div class="pdf-viewer__page-sheet-list" role="listbox" aria-label="PDF pages">
        <button
          v-for="page in pageOptions"
          :key="page"
          type="button"
          class="pdf-viewer__page-sheet-item"
          :class="{ 'pdf-viewer__page-sheet-item--active': page === viewer.pageNumber.value }"
          role="option"
          :aria-selected="page === viewer.pageNumber.value"
          @click="selectPage(page)"
        >
          <span>Page {{ page }}</span>
        </button>
      </div>
    </Dialog>
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
  flex: 1 1 auto;
  flex-wrap: nowrap;
  gap: var(--space-xs);
  inline-size: 100%;
  min-inline-size: 0;
}

.pdf-viewer__overflow-menu {
  margin-inline-start: auto;
}

.pdf-viewer__page-form {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
}

.pdf-viewer__page-sheet-trigger {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: none;
  font: inherit;
  inline-size: 80px;
  justify-content: center;
  min-block-size: var(--control-height-md);
  padding: 0 var(--space-sm);
  white-space: nowrap;
}

.pdf-viewer__page-sheet-trigger:focus-visible {
  border-color: var(--color-accent);
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.pdf-viewer__page-sheet-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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

.pdf-viewer__page-sheet-list {
  display: grid;
  gap: var(--space-xs);
  max-block-size: min(52vh, 360px);
  overflow: auto;
  padding-block-start: var(--space-sm);
}

.pdf-viewer__page-sheet-item {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  font: inherit;
  justify-content: space-between;
  min-block-size: var(--control-height-md);
  padding: 0 var(--space-sm);
  text-align: start;
}

.pdf-viewer__page-sheet-item:hover,
.pdf-viewer__page-sheet-item:focus-visible,
.pdf-viewer__page-sheet-item--active {
  background: var(--color-bg-subtle);
}

.pdf-viewer__page-sheet-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
  touch-action: pan-x pan-y;
  user-select: none;
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
  align-items: flex-start;
  display: flex;
  inline-size: 100%;
  min-block-size: 100%;
}

.pdf-viewer__canvas {
  background: white;
  box-shadow:
    0 18px 48px color-mix(in srgb, var(--color-fg) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-fg) 10%, transparent);
  display: block;
  max-block-size: none;
  max-inline-size: none;
  margin-inline: auto;
  user-select: none;
}

@media (max-width: 760px) {
  .pdf-viewer__page-form--desktop {
    display: none;
  }

  .pdf-viewer__page-sheet-trigger {
    display: inline-flex;
  }
}
</style>
