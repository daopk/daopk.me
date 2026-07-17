<script setup vapor lang="ts">
import { inject } from "vue";

import { AppFrame } from "@daopk/kit";
import { AppContextInjectionKey, useKernel, useVfs } from "@daopk/sdk";

import PdfViewerPageSheet from "./components/PdfViewerPageSheet.vue";
import PdfViewerToolbar from "./components/PdfViewerToolbar.vue";
import PdfViewerViewport from "./components/PdfViewerViewport.vue";
import { usePdfViewerAppController } from "./composables/usePdfViewerAppController";
import { usePdfViewerGestures } from "./composables/usePdfViewerGestures";
import { usePdfViewer } from "./usePdfViewer";
import "./styles/pdf-viewer.scss";

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();
const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : undefined;
const viewer = usePdfViewer({
  vfs,
  initialPath,
});
usePdfViewerGestures(viewer.viewportEl, viewer);

const {
  busy,
  download,
  fitWidth,
  goNext,
  goPrevious,
  hasDocument,
  onFileChange,
  openFilePicker,
  openPageSheet,
  pageDraft,
  pageOptions,
  pageSelectorLabel,
  pageSheetOpen,
  rotateClockwise,
  selectPage,
  setCanvasRef,
  setFileInputRef,
  setViewportRef,
  showChrome,
  submitPage,
  zoomIn,
  zoomOut,
} = usePdfViewerAppController({
  appContext: ctx,
  kernel,
  viewer,
});
</script>

<template>
  <AppFrame class="pdf-viewer" layout="flex-column" :safe-area="false" aria-label="PDF Viewer">
    <input
      :ref="setFileInputRef"
      class="pdf-viewer__file-input"
      type="file"
      accept="application/pdf,.pdf"
      @change="onFileChange"
    />

    <PdfViewerToolbar
      v-if="showChrome"
      v-model:page-draft="pageDraft"
      :busy="busy"
      :has-document="hasDocument"
      :page-selector-label="pageSelectorLabel"
      :viewer="viewer"
      @download="download"
      @fit-width="fitWidth"
      @go-next="goNext"
      @go-previous="goPrevious"
      @open-file="openFilePicker"
      @open-page-sheet="openPageSheet"
      @rotate-clockwise="rotateClockwise"
      @submit-page="submitPage"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
    />

    <PdfViewerViewport
      :has-document="hasDocument"
      :set-canvas-ref="setCanvasRef"
      :set-viewport-ref="setViewportRef"
      :viewer="viewer"
      @open="openFilePicker"
    />

    <PdfViewerPageSheet
      v-model:open="pageSheetOpen"
      :current-page="viewer.pageNumber.value"
      :page-options="pageOptions"
      @select-page="selectPage"
    />
  </AppFrame>
</template>
