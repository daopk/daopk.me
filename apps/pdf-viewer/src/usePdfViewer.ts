import { computed, getCurrentScope, onMounted, onScopeDispose, ref, type Ref } from "vue";

import {
  basename,
  detectVfsFileType,
  normalizeVfsPath,
  toErrorMessage,
  vfsFileTypeInputFromPath,
  type VfsPath,
  type VfsStat,
} from "@daopk/sdk";

export type PdfViewerStatus = "idle" | "loading" | "rendering" | "ready" | "error";
export type PdfViewerFitMode = "fit-width" | "custom";
export type PdfViewerSourceKind = "empty" | "vfs" | "file";

export interface PdfViewerVfsClient {
  stat(path: string): Promise<VfsStat | null>;
  read(path: string): Promise<Uint8Array | null>;
}

export interface PdfViewportLike {
  readonly width: number;
  readonly height: number;
}

export interface PdfRenderTaskLike {
  readonly promise: Promise<void>;
  cancel(extraDelay?: number): void;
}

export interface PdfPageLike {
  getViewport(params?: { scale?: number; rotation?: number }): PdfViewportLike;
  render(params: {
    canvas?: HTMLCanvasElement | null;
    canvasContext?: CanvasRenderingContext2D | null;
    viewport: PdfViewportLike;
    transform?: readonly number[];
    background?: string;
  }): PdfRenderTaskLike;
}

export interface PdfDocumentLike {
  readonly numPages: number;
  readonly loadingTask?: PdfLoadingTaskLike;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy?(): Promise<void>;
  cleanup?(keepLoadedFonts?: boolean): Promise<unknown>;
}

export interface PdfLoadingTaskLike {
  readonly promise: Promise<PdfDocumentLike>;
  destroy(): Promise<void>;
}

export interface PdfViewerAdapter {
  loadDocument(bytes: Uint8Array): Promise<PdfLoadingTaskLike>;
}

export interface PdfViewerZoomPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export interface UsePdfViewerOptions {
  readonly vfs: PdfViewerVfsClient;
  readonly initialPath?: string;
  readonly adapter?: PdfViewerAdapter;
}

export interface PdfViewerBindings {
  readonly canvasEl: Ref<HTMLCanvasElement | null>;
  readonly viewportEl: Ref<HTMLElement | null>;
  readonly status: Ref<PdfViewerStatus>;
  readonly sourceKind: Ref<PdfViewerSourceKind>;
  readonly title: Ref<string>;
  readonly path: Ref<string | null>;
  readonly pageNumber: Ref<number>;
  readonly pageCount: Ref<number>;
  readonly scale: Ref<number>;
  readonly rotation: Ref<number>;
  readonly fitMode: Ref<PdfViewerFitMode>;
  readonly error: Ref<string>;
  readonly message: Ref<string>;
  readonly canGoPrevious: Ref<boolean>;
  readonly canGoNext: Ref<boolean>;
  readonly canDownload: Ref<boolean>;
  readonly zoomLabel: Ref<string>;
  loadFromPath(path: string): Promise<boolean>;
  loadFromFile(file: File): Promise<boolean>;
  goPrevious(): boolean;
  goNext(): boolean;
  setPage(page: number): boolean;
  setScale(nextScale: number, point?: PdfViewerZoomPoint): boolean;
  previewScaleAt(nextScale: number, point: PdfViewerZoomPoint): boolean;
  commitPreviewScale(): Promise<boolean>;
  zoomIn(): boolean;
  zoomOut(): boolean;
  fitWidth(): Promise<boolean>;
  rotateClockwise(): boolean;
  download(): boolean;
  dispose(): void;
}

const DEFAULT_TITLE = "Untitled PDF";
const PDF_MIME_TYPE = "application/pdf";
const MIN_SCALE = 0.35;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.15;

export function usePdfViewer({
  vfs,
  initialPath,
  adapter = createPdfJsAdapter(),
}: UsePdfViewerOptions): PdfViewerBindings {
  const initialVfsPath =
    typeof initialPath === "string" && initialPath.trim().length > 0
      ? safeNormalizePath(initialPath)
      : null;
  const canvasEl = ref<HTMLCanvasElement | null>(null);
  const viewportEl = ref<HTMLElement | null>(null);
  const status = ref<PdfViewerStatus>("idle");
  const sourceKind = ref<PdfViewerSourceKind>("empty");
  const title = ref(initialVfsPath === null ? "" : basename(initialVfsPath));
  const path = ref<string | null>(initialVfsPath);
  const pageNumber = ref(1);
  const pageCount = ref(0);
  const scale = ref(1);
  const rotation = ref(0);
  const fitMode = ref<PdfViewerFitMode>("fit-width");
  const error = ref("");
  const message = ref("Open a PDF to start reading.");
  const activeBytes = ref<Uint8Array>();

  const canGoPrevious = computed(() => pageNumber.value > 1);
  const canGoNext = computed(() => pageNumber.value < pageCount.value);
  const canDownload = computed(() => activeBytes.value !== undefined);
  const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);

  let activeDocument: PdfDocumentLike | undefined;
  let activeLoadingTask: PdfLoadingTaskLike | undefined;
  let activeRenderTask: PdfRenderTaskLike | undefined;
  let activeRenderRun = 0;
  let activeLoadRun = 0;
  let pageBaseSize: PdfViewportLike | undefined;
  let disposed = false;
  let resizeObserver: ResizeObserver | undefined;
  let observedViewportEl: HTMLElement | null = null;

  function bindResizeObserver(): void {
    const el = viewportEl.value;
    if (typeof ResizeObserver !== "function") {
      return;
    }

    resizeObserver ??= new ResizeObserver(() => {
      if (fitMode.value === "fit-width") {
        void fitWidth();
      }
    });

    if (observedViewportEl !== null && observedViewportEl !== el) {
      resizeObserver.unobserve(observedViewportEl);
    }

    observedViewportEl = el;
    if (el !== null) {
      resizeObserver.observe(el);
    }
  }

  async function loadFromPath(nextPath: string): Promise<boolean> {
    const loadRun = beginLoad();
    const normalized = safeNormalizePath(nextPath);
    if (normalized === null) {
      fail(loadRun, "Enter a valid VFS path.");
      return false;
    }
    title.value = basename(normalized);
    path.value = normalized;

    try {
      const stat = await vfs.stat(normalized);
      if (!isCurrentLoad(loadRun)) {
        return false;
      }
      if (stat === null) {
        fail(loadRun, "PDF Viewer does not have permission to read this file.");
        return false;
      }
      if (stat.kind !== "file") {
        fail(loadRun, "PDF Viewer can only open files.");
        return false;
      }
      if (!isPdfFile(normalized, stat.mimeType)) {
        fail(loadRun, "PDF Viewer can only open PDF files.");
        return false;
      }

      const bytes = await vfs.read(normalized);
      if (!isCurrentLoad(loadRun)) {
        return false;
      }
      if (bytes === null) {
        fail(loadRun, "PDF Viewer does not have permission to read this file.");
        return false;
      }

      return await loadBytes(loadRun, bytes, {
        kind: "vfs",
        title: basename(normalized),
        path: normalized,
      });
    } catch (loadError) {
      fail(loadRun, toErrorMessage(loadError));
      return false;
    }
  }

  async function loadFromFile(file: File): Promise<boolean> {
    const loadRun = beginLoad();
    if (!isPdfFile(file.name, file.type)) {
      fail(loadRun, "Choose a PDF file.");
      return false;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isCurrentLoad(loadRun)) {
        return false;
      }

      return await loadBytes(loadRun, bytes, {
        kind: "file",
        title: file.name || DEFAULT_TITLE,
        path: null,
      });
    } catch (loadError) {
      fail(loadRun, toErrorMessage(loadError));
      return false;
    }
  }

  function beginLoad(): number {
    const loadRun = ++activeLoadRun;
    activeRenderRun++;
    cleanupActiveRender();
    cleanupDocument();
    clearCanvas();
    pageBaseSize = undefined;
    activeBytes.value = undefined;
    status.value = "loading";
    sourceKind.value = "empty";
    title.value = "";
    path.value = null;
    pageNumber.value = 1;
    pageCount.value = 0;
    error.value = "";
    message.value = "Loading PDF...";
    return loadRun;
  }

  async function loadBytes(
    loadRun: number,
    bytes: Uint8Array,
    source: { kind: Exclude<PdfViewerSourceKind, "empty">; title: string; path: string | null },
  ): Promise<boolean> {
    activeBytes.value = copyBytes(bytes);
    let loadingTask: PdfLoadingTaskLike;

    try {
      loadingTask = await adapter.loadDocument(copyBytes(bytes));
    } catch (loadError) {
      fail(loadRun, toErrorMessage(loadError));
      return false;
    }

    if (!isCurrentLoad(loadRun)) {
      destroyLoadingTask(loadingTask);
      return false;
    }

    activeLoadingTask = loadingTask;

    try {
      const document = await loadingTask.promise;
      if (!isCurrentLoad(loadRun)) {
        destroyDocument(document);
        return false;
      }

      activeLoadingTask = undefined;
      activeDocument = document;
      sourceKind.value = source.kind;
      title.value = source.title;
      path.value = source.path;
      pageCount.value = Math.max(0, document.numPages);
      pageNumber.value = document.numPages > 0 ? 1 : 0;
      message.value =
        document.numPages > 0 ? `Loaded ${source.title}.` : "This PDF does not contain pages.";
      if (document.numPages <= 0) {
        status.value = "ready";
        return true;
      }

      if (fitMode.value === "fit-width") {
        await fitWidth({ render: false });
      }
      await renderCurrentPage();
      return true;
    } catch (loadError) {
      fail(loadRun, toErrorMessage(loadError));
      return false;
    } finally {
      if (activeLoadingTask === loadingTask) {
        activeLoadingTask = undefined;
      }
    }
  }

  function goPrevious(): boolean {
    return setPage(pageNumber.value - 1);
  }

  function goNext(): boolean {
    return setPage(pageNumber.value + 1);
  }

  function setPage(page: number): boolean {
    if (activeDocument === undefined || pageCount.value <= 0) {
      return false;
    }

    const next = clampPage(page, pageCount.value);
    if (next === pageNumber.value) {
      return false;
    }

    pageNumber.value = next;
    pageBaseSize = undefined;
    void renderCurrentPage();
    return true;
  }

  function zoomIn(): boolean {
    return setScale(scale.value + ZOOM_STEP, viewportCenterPoint());
  }

  function zoomOut(): boolean {
    return setScale(scale.value - ZOOM_STEP, viewportCenterPoint());
  }

  function setScale(nextScale: number, point = viewportCenterPoint()): boolean {
    if (activeDocument === undefined) {
      return false;
    }

    const next = clampScale(nextScale);
    if (Math.abs(next - scale.value) < 0.001) {
      return false;
    }

    fitMode.value = "custom";
    previewCanvasScale(next, point);
    scale.value = next;
    void renderCurrentPage();
    return true;
  }

  function previewScaleAt(nextScale: number, point: PdfViewerZoomPoint): boolean {
    if (activeDocument === undefined || pageCount.value <= 0) {
      return false;
    }

    const next = clampScale(nextScale);
    if (Math.abs(next - scale.value) < 0.001) {
      return false;
    }

    if (activeRenderTask !== undefined) {
      activeRenderRun++;
      cleanupActiveRender();
      status.value = "ready";
    }

    fitMode.value = "custom";
    previewCanvasScale(next, point);
    scale.value = next;
    return true;
  }

  async function commitPreviewScale(): Promise<boolean> {
    if (activeDocument === undefined || pageCount.value <= 0) {
      return false;
    }

    fitMode.value = "custom";
    return await renderCurrentPage();
  }

  async function fitWidth(options: { render?: boolean } = {}): Promise<boolean> {
    if (activeDocument === undefined || pageCount.value <= 0) {
      return false;
    }

    const page = await activeDocument.getPage(clampPage(pageNumber.value, pageCount.value));
    if (disposed) {
      return false;
    }

    const viewport = page.getViewport({ scale: 1, rotation: rotation.value });
    pageBaseSize = viewportSize(viewport);
    const availableWidth = Math.max(0, viewportEl.value?.clientWidth ?? 0);
    const nextScale = availableWidth > 0 ? clampScale(availableWidth / viewport.width) : 1;
    fitMode.value = "fit-width";
    previewCanvasScale(nextScale);
    scale.value = nextScale;

    if (options.render !== false) {
      await renderCurrentPage();
    }
    return true;
  }

  function rotateClockwise(): boolean {
    if (activeDocument === undefined) {
      return false;
    }

    rotation.value = (rotation.value + 90) % 360;
    pageBaseSize = undefined;
    if (fitMode.value === "fit-width") {
      void fitWidth();
    } else {
      void renderCurrentPage();
    }
    return true;
  }

  function download(): boolean {
    if (activeBytes.value === undefined || typeof URL.createObjectURL !== "function") {
      return false;
    }

    const blob = new Blob([copyBytes(activeBytes.value).buffer], { type: PDF_MIME_TYPE });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = title.value || DEFAULT_TITLE;
    link.rel = "noopener";
    link.click();
    URL.revokeObjectURL(objectUrl);
    return true;
  }

  function viewportCenterPoint(): PdfViewerZoomPoint | undefined {
    const el = viewportEl.value;
    if (el === null) {
      return undefined;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }

    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }

  function previewCanvasScale(nextScale: number, point?: PdfViewerZoomPoint): void {
    const canvas = canvasEl.value;
    const baseSize = pageBaseSize;
    if (canvas === null || baseSize === undefined) {
      return;
    }

    const previousScale = scale.value;
    const beforeRect = point === undefined ? null : canvas.getBoundingClientRect();
    applyCanvasDisplaySize(canvas, {
      width: baseSize.width * nextScale,
      height: baseSize.height * nextScale,
    });

    const viewport = viewportEl.value;
    if (
      point === undefined ||
      beforeRect === null ||
      viewport === null ||
      beforeRect.width <= 0 ||
      beforeRect.height <= 0 ||
      previousScale <= 0
    ) {
      return;
    }

    const ratio = nextScale / previousScale;
    const afterRect = canvas.getBoundingClientRect();
    const localX = point.clientX - beforeRect.left;
    const localY = point.clientY - beforeRect.top;
    const nextClientX = afterRect.left + localX * ratio;
    const nextClientY = afterRect.top + localY * ratio;
    const deltaX = nextClientX - point.clientX;
    const deltaY = nextClientY - point.clientY;

    if (Number.isFinite(deltaX)) {
      viewport.scrollLeft += deltaX;
    }
    if (Number.isFinite(deltaY)) {
      viewport.scrollTop += deltaY;
    }
  }

  async function renderCurrentPage(): Promise<boolean> {
    const document = activeDocument;
    const canvas = canvasEl.value;
    if (document === undefined || pageCount.value <= 0) {
      return false;
    }

    const renderRun = ++activeRenderRun;
    cleanupActiveRender();

    if (canvas === null) {
      status.value = "ready";
      return false;
    }

    status.value = "rendering";
    message.value = `Rendering page ${pageNumber.value} of ${pageCount.value}...`;

    try {
      const page = await document.getPage(clampPage(pageNumber.value, pageCount.value));
      if (!isCurrentRender(renderRun)) {
        return false;
      }

      const baseViewport = page.getViewport({ scale: 1, rotation: rotation.value });
      const viewport = page.getViewport({ scale: scale.value, rotation: rotation.value });
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("Canvas rendering is unavailable in this browser.");
      }

      pageBaseSize = viewportSize(baseViewport);
      const outputScale = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      applyCanvasDisplaySize(canvas, viewport);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        background: "rgb(255,255,255)",
      });
      activeRenderTask = renderTask;
      await renderTask.promise;

      if (!isCurrentRender(renderRun)) {
        return false;
      }

      status.value = "ready";
      message.value = `Page ${pageNumber.value} of ${pageCount.value}.`;
      return true;
    } catch (renderError) {
      if (isCurrentRender(renderRun) && !isRenderingCancelled(renderError)) {
        status.value = "error";
        error.value = toErrorMessage(renderError);
        message.value = error.value;
      }
      return false;
    } finally {
      if (isCurrentRender(renderRun)) {
        activeRenderTask = undefined;
      }
    }
  }

  function fail(loadRun: number, nextMessage: string): void {
    if (!isCurrentLoad(loadRun)) {
      return;
    }

    cleanupActiveRender();
    cleanupDocument();
    clearCanvas();
    activeBytes.value = undefined;
    status.value = "error";
    sourceKind.value = "empty";
    title.value = "";
    path.value = null;
    pageNumber.value = 1;
    pageCount.value = 0;
    error.value = nextMessage;
    message.value = nextMessage;
  }

  function isCurrentLoad(loadRun: number): boolean {
    return !disposed && loadRun === activeLoadRun;
  }

  function isCurrentRender(renderRun: number): boolean {
    return !disposed && renderRun === activeRenderRun;
  }

  function cleanupActiveRender(): void {
    const task = activeRenderTask;
    activeRenderTask = undefined;
    if (task !== undefined) {
      try {
        task.cancel();
      } catch {}
      void task.promise.catch(() => undefined);
    }
  }

  function cleanupDocument(): void {
    const loadingTask = activeLoadingTask;
    activeLoadingTask = undefined;
    if (loadingTask !== undefined) {
      destroyLoadingTask(loadingTask);
    }

    const document = activeDocument;
    activeDocument = undefined;
    if (document !== undefined) {
      destroyDocument(document);
    }
  }

  function clearCanvas(): void {
    const canvas = canvasEl.value;
    if (canvas === null) {
      return;
    }

    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.aspectRatio = "";
    canvas.style.inlineSize = "";
    canvas.style.blockSize = "";
  }

  function destroyLoadingTask(loadingTask: PdfLoadingTaskLike): void {
    void loadingTask.destroy().catch(() => undefined);
    void loadingTask.promise
      .then((document) => {
        if (typeof document.destroy === "function") {
          return document.destroy();
        }

        if (document.loadingTask !== undefined && document.loadingTask !== loadingTask) {
          return document.loadingTask.destroy();
        }

        return undefined;
      })
      .catch(() => undefined);
  }

  function destroyDocument(document: PdfDocumentLike): void {
    if (typeof document.destroy === "function") {
      void document.destroy().catch(() => undefined);
      return;
    }

    if (document.loadingTask !== undefined) {
      void document.loadingTask.destroy().catch(() => undefined);
      return;
    }

    void document.cleanup?.().catch(() => undefined);
  }

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    activeLoadRun++;
    activeRenderRun++;
    resizeObserver?.disconnect();
    observedViewportEl = null;
    cleanupActiveRender();
    cleanupDocument();
  }

  onMounted(() => {
    bindResizeObserver();
    if (typeof initialPath === "string" && initialPath.trim().length > 0) {
      void loadFromPath(initialPath);
    }
  });

  if (getCurrentScope() !== undefined) {
    onScopeDispose(dispose);
  }

  return {
    canvasEl,
    viewportEl,
    status,
    sourceKind,
    title,
    path,
    pageNumber,
    pageCount,
    scale,
    rotation,
    fitMode,
    error,
    message,
    canGoPrevious,
    canGoNext,
    canDownload,
    zoomLabel,
    loadFromPath,
    loadFromFile,
    goPrevious,
    goNext,
    setPage,
    setScale,
    previewScaleAt,
    commitPreviewScale,
    zoomIn,
    zoomOut,
    fitWidth,
    rotateClockwise,
    download,
    dispose,
  };
}

export function createPdfJsAdapter(): PdfViewerAdapter {
  return {
    async loadDocument(bytes: Uint8Array): Promise<PdfLoadingTaskLike> {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs.getDocument({ data: copyBytes(bytes) }) as unknown as PdfLoadingTaskLike;
    },
  };
}

export function isPdfFile(name: string, mimeType?: string): boolean {
  return detectVfsFileType(vfsFileTypeInputFromPath(name, mimeType)) === "pdf";
}

function safeNormalizePath(path: string): VfsPath | null {
  try {
    return normalizeVfsPath(path);
  } catch {
    return null;
  }
}

function viewportSize(viewport: PdfViewportLike): PdfViewportLike {
  return {
    width: viewport.width,
    height: viewport.height,
  };
}

function applyCanvasDisplaySize(canvas: HTMLCanvasElement, size: PdfViewportLike): void {
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.inlineSize = "";
  canvas.style.blockSize = "";
}

function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(page), 1), pageCount);
}

function clampScale(value: number): number {
  return Math.min(Math.max(value, MIN_SCALE), MAX_SCALE);
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

function isRenderingCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}
