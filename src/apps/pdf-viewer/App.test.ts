import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

import { AppContextInjectionKey, type AppContext } from "~/types/app";

import App from "./App.vue";
import type {
  PdfViewerBindings,
  PdfViewerFitMode,
  PdfViewerSourceKind,
  PdfViewerStatus,
} from "./usePdfViewer";

const mocks = vi.hoisted(() => ({
  usePdfViewer: vi.fn(),
  useVfs: vi.fn(() => ({ stat: vi.fn(), read: vi.fn() })),
}));

vi.mock("./usePdfViewer", () => ({
  usePdfViewer: mocks.usePdfViewer,
}));

vi.mock("~/composables/useVfs", () => ({
  useVfs: mocks.useVfs,
}));

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "pdf-viewer",
    handleId: "pdf-viewer-handle",
    args: Object.freeze(args),
  });
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
      pageNumber.value = page;
      return true;
    }),
    zoomIn: vi.fn(() => true),
    zoomOut: vi.fn(() => true),
    fitWidth: vi.fn(async () => true),
    rotateClockwise: vi.fn(() => true),
    download: vi.fn(() => true),
    dispose: vi.fn(),
  };
}

function mountPdfViewer(viewer: PdfViewerBindings, context = makeContext()) {
  mocks.usePdfViewer.mockReturnValue(viewer);
  return mount(App, {
    global: {
      provide: {
        [AppContextInjectionKey as symbol]: context,
      },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PDF Viewer App.vue", () => {
  it("renders the empty state by default", () => {
    const viewer = makeViewer();
    const wrapper = mountPdfViewer(viewer);

    expect(wrapper.text()).toContain("Open a PDF");
    expect(wrapper.find(".pdf-viewer__page").attributes("style")).toContain("display: none");
    expect(mocks.usePdfViewer).toHaveBeenCalledWith({
      vfs: expect.anything(),
      initialPath: undefined,
    });

    wrapper.unmount();
  });

  it("passes launch args.path into the viewer composable", () => {
    const viewer = makeViewer({
      status: "ready",
      title: "spec.pdf",
      path: "/docs/spec.pdf",
      sourceKind: "vfs",
      pageCount: 2,
    });
    const wrapper = mountPdfViewer(viewer, makeContext({ path: "/docs/spec.pdf" }));

    expect(mocks.usePdfViewer).toHaveBeenCalledWith({
      vfs: expect.anything(),
      initialPath: "/docs/spec.pdf",
    });
    expect(wrapper.text()).toContain("spec.pdf");
    expect(wrapper.text()).toContain("/docs/spec.pdf");

    wrapper.unmount();
  });

  it("loads a selected local PDF file", async () => {
    const viewer = makeViewer();
    const wrapper = mountPdfViewer(viewer);
    const input = wrapper.find('input[type="file"]');
    const file = new File(["%PDF"], "local.pdf", { type: "application/pdf" });

    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [file],
    });
    await input.trigger("change");

    expect(viewer.loadFromFile).toHaveBeenCalledWith(file);

    wrapper.unmount();
  });

  it("wires toolbar controls to viewer actions", async () => {
    const viewer = makeViewer({ status: "ready", title: "book.pdf", pageNumber: 1, pageCount: 3 });
    const wrapper = mountPdfViewer(viewer);

    await wrapper.find('button[aria-label="Next page"]').trigger("click");
    await wrapper.find('button[aria-label="Zoom in"]').trigger("click");
    await wrapper.find('button[aria-label="Fit width"]').trigger("click");
    await wrapper.find('button[aria-label="Rotate clockwise"]').trigger("click");
    await wrapper.find('button[aria-label="Download PDF"]').trigger("click");
    await wrapper.find("#pdf-viewer-page").setValue("2");
    await wrapper.find(".pdf-viewer__page-form").trigger("submit");

    expect(viewer.goNext).toHaveBeenCalledTimes(1);
    expect(viewer.zoomIn).toHaveBeenCalledTimes(1);
    expect(viewer.fitWidth).toHaveBeenCalledTimes(1);
    expect(viewer.rotateClockwise).toHaveBeenCalledTimes(1);
    expect(viewer.download).toHaveBeenCalledTimes(1);
    expect(viewer.setPage).toHaveBeenCalledWith(2);

    wrapper.unmount();
  });

  it("shows viewer errors", () => {
    const viewer = makeViewer({ status: "error", error: "PDF Viewer can only open PDF files." });
    const wrapper = mountPdfViewer(viewer);

    expect(wrapper.find('[role="alert"]').text()).toContain("PDF Viewer can only open PDF files.");

    wrapper.unmount();
  });
});
