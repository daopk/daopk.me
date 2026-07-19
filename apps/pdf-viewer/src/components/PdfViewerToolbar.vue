<script setup vapor lang="ts">
import { computed, ref } from "vue";

import { AppToolbar, Separator, ToolbarGroup } from "@daopk/kit";
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  IconButton,
  NumberInput,
} from "@daopk/ui";
import ChevronLeft from "~icons/lucide/chevron-left";
import ChevronRight from "~icons/lucide/chevron-right";
import Download from "~icons/lucide/download";
import MoreHorizontal from "~icons/lucide/more-horizontal";
import MoveHorizontal from "~icons/lucide/move-horizontal";
import RotateCwSquare from "~icons/daopk/rotate-cw-square";
import Upload from "~icons/lucide/upload";
import ZoomIn from "~icons/lucide/zoom-in";
import ZoomOut from "~icons/lucide/zoom-out";

import { usePdfViewerToolbarLayout } from "../composables/usePdfViewerToolbarLayout";
import type { PdfViewerBindings } from "../usePdfViewer";

const props = defineProps<{
  readonly busy: boolean;
  readonly hasDocument: boolean;
  readonly pageDraft: string;
  readonly pageSelectorLabel: string;
  readonly viewer: PdfViewerBindings;
}>();

const emit = defineEmits<{
  download: [];
  fitWidth: [];
  goNext: [];
  goPrevious: [];
  openFile: [];
  openPageSheet: [];
  rotateClockwise: [];
  submitPage: [];
  "update:pageDraft": [value: string];
  zoomIn: [];
  zoomOut: [];
}>();

const numericPageDraft = computed(() => {
  if (props.pageDraft.trim().length === 0) return null;
  const value = Number(props.pageDraft);
  return Number.isFinite(value) ? value : null;
});

const controlsEl = ref<HTMLElement | null>(null);
const {
  hasOverflowDocumentAction,
  hasOverflowPageToolAction,
  hasOverflowToolbarActions,
  hasOverflowZoomAction,
  hasVisibleToolbarTools,
  isToolbarActionOverflowed,
  isToolbarActionVisible,
} = usePdfViewerToolbarLayout({
  controlsEl,
  layoutTriggers: [props.viewer.pageCount, props.viewer.zoomLabel],
});
</script>

<template>
  <AppToolbar class="pdf-viewer__toolbar">
    <div ref="controlsEl" class="pdf-viewer__controls" aria-label="PDF controls">
      <ToolbarGroup
        v-if="isToolbarActionVisible('open')"
        class="pdf-viewer__document-group"
        label="Document"
      >
        <IconButton ariaLabel="Open PDF" :disabled="busy" @click="emit('openFile')">
          <Upload aria-hidden="true" />
        </IconButton>
      </ToolbarGroup>

      <Separator
        v-if="isToolbarActionVisible('open')"
        class="pdf-viewer__toolbar-separator"
        orientation="vertical"
        decorative
      />

      <ToolbarGroup class="pdf-viewer__page-group" label="Pages">
        <IconButton
          ariaLabel="Previous page"
          :disabled="!viewer.canGoPrevious.value || busy"
          @click="emit('goPrevious')"
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <form
          class="pdf-viewer__page-form pdf-viewer__page-form--desktop"
          @submit.prevent="emit('submitPage')"
        >
          <label class="pdf-viewer__page-label" for="pdf-viewer-page">Page</label>
          <NumberInput
            id="pdf-viewer-page"
            class="pdf-viewer__page-input-root"
            :class-names="{ input: 'pdf-viewer__page-input' }"
            :model-value="numericPageDraft"
            :min="1"
            :max="viewer.pageCount.value || undefined"
            :controls="false"
            :clamp-on-blur="false"
            :input-attrs="{
              inputmode: 'numeric',
              onBlur: () => emit('submitPage'),
            }"
            :disabled="!hasDocument || busy"
            @update:model-value="emit('update:pageDraft', $event === null ? '' : String($event))"
          />
          <span class="pdf-viewer__page-total">/ {{ viewer.pageCount.value || "-" }}</span>
        </form>
        <Button
          class="pdf-viewer__page-sheet-trigger"
          variant="surface"
          :disabled="!hasDocument || busy"
          :aria-label="`Select page ${pageSelectorLabel}`"
          @click="emit('openPageSheet')"
        >
          {{ pageSelectorLabel }}
        </Button>
        <IconButton
          ariaLabel="Next page"
          :disabled="!viewer.canGoNext.value || busy"
          @click="emit('goNext')"
        >
          <ChevronRight aria-hidden="true" />
        </IconButton>
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
          ariaLabel="Zoom out"
          :disabled="!hasDocument || busy"
          @click="emit('zoomOut')"
        >
          <ZoomOut aria-hidden="true" />
        </IconButton>
        <span v-if="isToolbarActionVisible('zoom')" class="pdf-viewer__zoom" aria-live="polite">{{
          viewer.zoomLabel.value
        }}</span>
        <IconButton
          v-if="isToolbarActionVisible('zoom')"
          ariaLabel="Zoom in"
          :disabled="!hasDocument || busy"
          @click="emit('zoomIn')"
        >
          <ZoomIn aria-hidden="true" />
        </IconButton>
        <IconButton
          v-if="isToolbarActionVisible('fit')"
          ariaLabel="Fit width"
          :disabled="!hasDocument || busy"
          @click="emit('fitWidth')"
        >
          <MoveHorizontal aria-hidden="true" />
        </IconButton>
        <IconButton
          v-if="isToolbarActionVisible('rotate')"
          ariaLabel="Rotate clockwise"
          :disabled="!hasDocument || busy"
          @click="emit('rotateClockwise')"
        >
          <RotateCwSquare aria-hidden="true" />
        </IconButton>
        <IconButton
          v-if="isToolbarActionVisible('download')"
          ariaLabel="Download PDF"
          :disabled="!viewer.canDownload.value || busy"
          @click="emit('download')"
        >
          <Download aria-hidden="true" />
        </IconButton>
      </ToolbarGroup>

      <ToolbarGroup
        v-if="hasOverflowToolbarActions"
        class="pdf-viewer__overflow-menu"
        label="More PDF tools"
      >
        <DropdownMenu align="end">
          <template #trigger>
            <IconButton ariaLabel="More PDF tools" :disabled="busy">
              <MoreHorizontal aria-hidden="true" />
            </IconButton>
          </template>

          <template #items>
            <DropdownMenuItem
              v-if="isToolbarActionOverflowed('open')"
              text-value="Open PDF"
              :disabled="busy"
              @select="emit('openFile')"
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
              @select="emit('zoomOut')"
            >
              <ZoomOut class="ds-dropdown-menu__item-icon" aria-hidden="true" />
              <span>Zoom out</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="isToolbarActionOverflowed('zoom')"
              text-value="Zoom in"
              :disabled="!hasDocument || busy"
              @select="emit('zoomIn')"
            >
              <ZoomIn class="ds-dropdown-menu__item-icon" aria-hidden="true" />
              <span>Zoom in</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="hasOverflowZoomAction && hasOverflowPageToolAction" />
            <DropdownMenuItem
              v-if="isToolbarActionOverflowed('fit')"
              text-value="Fit width"
              :disabled="!hasDocument || busy"
              @select="emit('fitWidth')"
            >
              <MoveHorizontal class="ds-dropdown-menu__item-icon" aria-hidden="true" />
              <span>Fit width</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="isToolbarActionOverflowed('rotate')"
              text-value="Rotate clockwise"
              :disabled="!hasDocument || busy"
              @select="emit('rotateClockwise')"
            >
              <RotateCwSquare class="ds-dropdown-menu__item-icon" aria-hidden="true" />
              <span>Rotate clockwise</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="isToolbarActionOverflowed('download')"
              text-value="Download PDF"
              :disabled="!viewer.canDownload.value || busy"
              @select="emit('download')"
            >
              <Download class="ds-dropdown-menu__item-icon" aria-hidden="true" />
              <span>Download PDF</span>
            </DropdownMenuItem>
          </template>
        </DropdownMenu>
      </ToolbarGroup>
    </div>
  </AppToolbar>
</template>
