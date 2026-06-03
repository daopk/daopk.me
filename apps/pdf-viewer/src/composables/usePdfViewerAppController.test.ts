import { mount } from "@vue/test-utils";
import { computed, defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppChromeInjectionKey,
  type AppChromeController,
  type AppContext,
  type Kernel,
} from "@daopk/sdk";

import {
  usePdfViewerAppController,
  type UsePdfViewerAppControllerBindings,
} from "./usePdfViewerAppController";
import type {
  PdfViewerBindings,
  PdfViewerFitMode,
  PdfViewerSourceKind,
  PdfViewerStatus,
} from "../usePdfViewer";

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "pdf-viewer",
    handleId: "pdf-viewer-handle",
    args: Object.freeze(args),
  });
}

function makeKernel(): Pick<Kernel, "events"> {
  return {
    events: {
      emit: vi.fn(),
    },
  } as unknown as Pick<Kernel, "events">;
}

function makeAppChrome(): AppChromeController {
  return {
    setTitle: vi.fn(),
    setBackAction: vi.fn(),
  };
}

function makeViewer(
  options: {
    status?: PdfViewerStatus;
    title?: string;
    path?: string | null;
    sourceKind?: PdfViewerSourceKind;
    pageNumber?: number;
    pageCount?: number;
    error?: string;
  } = {},
): PdfViewerBindings {
  const pageNumber = ref(options.pageNumber ?? 1);
  const pageCount = ref(options.pageCount ?? 0);
  const scale = ref(1);
  const activeBytes = ref(options.pageCount !== undefined && options.pageCount > 0);

  return {
    canvasEl: ref<HTMLCanvasElement | null>(null),
    viewportEl: ref<HTMLElement | null>(null),
    status: ref<PdfViewerStatus>(options.status ?? "idle"),
    sourceKind: ref<PdfViewerSourceKind>(options.sourceKind ?? "empty"),
    title: ref(options.title ?? ""),
    path: ref(options.path ?? null),
    pageNumber,
    pageCount,
    scale,
    rotation: ref(0),
    fitMode: ref<PdfViewerFitMode>("fit-width"),
    error: ref(options.error ?? ""),
    message: ref("Ready."),
    canGoPrevious: computed(() => pageNumber.value > 1),
    canGoNext: computed(() => pageNumber.value < pageCount.value),
    canDownload: computed(() => activeBytes.value),
    zoomLabel: computed(() => `${Math.round(scale.value * 100)}%`),
    loadFromPath: vi.fn(async () => true),
    loadFromFile: vi.fn(async () => true),
    goPrevious: vi.fn(() => true),
    goNext: vi.fn(() => true),
    setPage: vi.fn((page: number) => {
      if (!Number.isFinite(page) || page < 1 || page > pageCount.value) {
        return false;
      }
      pageNumber.value = page;
      return true;
    }),
    previewScaleAt: vi.fn(() => true),
    commitPreviewScale: vi.fn(async () => true),
    zoomIn: vi.fn(() => true),
    zoomOut: vi.fn(() => true),
    fitWidth: vi.fn(async () => true),
    rotateClockwise: vi.fn(() => true),
    download: vi.fn(() => true),
    dispose: vi.fn(),
  };
}

function mountController(
  viewer: PdfViewerBindings,
  options: {
    readonly appChrome?: AppChromeController;
    readonly appContext?: AppContext | null;
    readonly kernel?: Pick<Kernel, "events">;
  } = {},
): {
  controller: UsePdfViewerAppControllerBindings;
  kernel: Pick<Kernel, "events">;
  unmount: () => void;
} {
  let controller: UsePdfViewerAppControllerBindings | undefined;
  const kernel = options.kernel ?? makeKernel();
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = usePdfViewerAppController({
          appContext: options.appContext ?? makeContext(),
          kernel,
          viewer,
        });
        return () => null;
      },
    }),
    {
      global: {
        provide:
          options.appChrome === undefined
            ? {}
            : { [AppChromeInjectionKey as symbol]: options.appChrome },
      },
    },
  );

  if (controller === undefined) {
    throw new Error("Failed to mount PDF viewer controller harness.");
  }

  return {
    controller,
    kernel,
    unmount: () => wrapper.unmount(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("usePdfViewerAppController", () => {
  it("syncs the page draft with the active page and resets invalid submissions", async () => {
    const viewer = makeViewer({
      status: "ready",
      sourceKind: "file",
      pageNumber: 3,
      pageCount: 5,
    });
    const { controller, unmount } = mountController(viewer);

    expect(controller.pageDraft.value).toBe("3");

    viewer.pageNumber.value = 4;
    await nextTick();

    expect(controller.pageDraft.value).toBe("4");

    controller.pageDraft.value = "nope";
    controller.submitPage();

    expect(controller.pageDraft.value).toBe("4");
    expect(viewer.setPage).not.toHaveBeenCalledWith(Number.NaN);

    controller.pageDraft.value = "2";
    controller.submitPage();

    expect(viewer.setPage).toHaveBeenCalledWith(2);
    expect(controller.pageDraft.value).toBe("2");

    unmount();
  });

  it("loads a selected local PDF file and clears the input value", () => {
    const viewer = makeViewer();
    const { controller, unmount } = mountController(viewer);
    const file = new File(["%PDF"], "local.pdf", { type: "application/pdf" });
    const input = {
      files: [file],
      value: "local.pdf",
    } as unknown as HTMLInputElement;

    controller.onFileChange({ target: input } as unknown as Event);

    expect(viewer.loadFromFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe("");

    unmount();
  });

  it("opens the page sheet only for idle documents and closes after selecting a page", () => {
    const viewer = makeViewer({
      status: "ready",
      sourceKind: "file",
      pageNumber: 1,
      pageCount: 3,
    });
    const { controller, unmount } = mountController(viewer);

    expect(controller.pageSelectorLabel.value).toBe("1 / 3");
    expect(controller.pageOptions.value).toEqual([1, 2, 3]);

    controller.openPageSheet();
    expect(controller.pageSheetOpen.value).toBe(true);

    controller.selectPage(2);
    expect(viewer.setPage).toHaveBeenCalledWith(2);
    expect(controller.pageSheetOpen.value).toBe(false);

    viewer.status.value = "loading";
    controller.openPageSheet();
    expect(controller.pageSheetOpen.value).toBe(false);

    unmount();
  });

  it("pushes app chrome titles and emits normalized document path changes", async () => {
    const appChrome = makeAppChrome();
    const viewer = makeViewer();
    const { kernel, unmount } = mountController(viewer, { appChrome });

    expect(appChrome.setTitle).toHaveBeenLastCalledWith("PDF Viewer");
    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "pdf-viewer-handle",
      path: null,
    });

    viewer.title.value = "spec.pdf";
    viewer.path.value = "/docs/spec.pdf";
    await nextTick();

    expect(appChrome.setTitle).toHaveBeenLastCalledWith("spec.pdf");
    expect(kernel.events.emit).toHaveBeenLastCalledWith("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "pdf-viewer-handle",
      path: "/docs/spec.pdf",
    });

    unmount();
  });

  it("binds file, viewport, and canvas refs for the root app", () => {
    const viewer = makeViewer();
    const { controller, unmount } = mountController(viewer);
    const fileInput = document.createElement("input");
    const viewport = document.createElement("main");
    const canvas = document.createElement("canvas");

    controller.setFileInputRef(fileInput);
    controller.setViewportRef({ element: viewport });
    controller.setCanvasRef(canvas);

    expect(controller.fileInput.value).toBe(fileInput);
    expect(viewer.viewportEl.value).toBe(viewport);
    expect(viewer.canvasEl.value).toBe(canvas);

    unmount();
  });
});
