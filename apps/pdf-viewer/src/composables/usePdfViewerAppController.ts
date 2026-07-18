import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from "vue";

import { useAppChrome } from "@daopk/kit";
import { normalizeVfsPath, type AppContext, type Kernel } from "@daopk/sdk";

import type { PdfViewerBindings } from "../usePdfViewer";

export interface UsePdfViewerAppControllerOptions {
  readonly appContext: AppContext | null;
  readonly kernel: Pick<Kernel, "events">;
  readonly viewer: PdfViewerBindings;
}

export interface UsePdfViewerAppControllerBindings {
  readonly fileInput: Ref<HTMLInputElement | null>;
  readonly pageDraft: Ref<string>;
  readonly pageSheetOpen: Ref<boolean>;
  readonly hasDocument: ComputedRef<boolean>;
  readonly showChrome: ComputedRef<boolean>;
  readonly busy: ComputedRef<boolean>;
  readonly pageSelectorLabel: ComputedRef<string>;
  readonly pageOptions: ComputedRef<readonly number[]>;
  download(): void;
  fitWidth(): void;
  goNext(): void;
  goPrevious(): void;
  onFileChange(event: Event): void;
  openFilePicker(): void;
  openPageSheet(): void;
  rotateClockwise(): void;
  selectPage(page: number): void;
  setCanvasRef(el: unknown): void;
  setFileInputRef(el: unknown): void;
  setViewportRef(el: unknown): void;
  submitPage(): void;
  zoomIn(): void;
  zoomOut(): void;
}

export function usePdfViewerAppController({
  appContext,
  kernel,
  viewer,
}: UsePdfViewerAppControllerOptions): UsePdfViewerAppControllerBindings {
  const fileInput = ref<HTMLInputElement | null>(null);
  const pageDraft = ref("1");
  const pageSheetOpen = ref(false);
  let viewportRefRevision = 0;

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
    if (appContext === null) {
      return;
    }

    kernel.events.emit("app.document.changed", {
      manifestId: appContext.manifestId,
      handleId: appContext.handleId,
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

  function setViewportRef(el: unknown): void {
    const revision = ++viewportRefRevision;
    if (el instanceof HTMLElement) {
      viewer.viewportEl.value = el;
      return;
    }
    if (el === null || typeof el !== "object" || !("element" in el)) {
      viewer.viewportEl.value = null;
      return;
    }

    const exposed = el as { readonly element: HTMLElement | null };
    const resolveExposedElement = (): void => {
      if (revision !== viewportRefRevision) {
        return;
      }
      viewer.viewportEl.value = exposed.element instanceof HTMLElement ? exposed.element : null;
    };

    resolveExposedElement();
    if (viewer.viewportEl.value === null) {
      void nextTick(resolveExposedElement);
    }
  }

  function setCanvasRef(el: unknown): void {
    viewer.canvasEl.value = el instanceof HTMLCanvasElement ? el : null;
  }

  function setFileInputRef(el: unknown): void {
    fileInput.value = el instanceof HTMLInputElement ? el : null;
  }

  return {
    fileInput,
    pageDraft,
    pageSheetOpen,
    hasDocument,
    showChrome,
    busy,
    pageSelectorLabel,
    pageOptions,
    download,
    fitWidth,
    goNext,
    goPrevious,
    onFileChange,
    openFilePicker,
    openPageSheet,
    rotateClockwise,
    selectPage,
    setCanvasRef,
    setFileInputRef,
    setViewportRef,
    submitPage,
    zoomIn,
    zoomOut,
  };
}
