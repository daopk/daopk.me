import { mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, ref } from "vue";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppChromeController,
  type AppContext,
} from "@daopk/sdk";
import { finishLeavingModals, queryActiveModalDialog } from "~/test/ropavModal";

import App from "./App.vue";
import type {
  PdfViewerBindings,
  PdfViewerFitMode,
  PdfViewerSourceKind,
  PdfViewerStatus,
} from "./usePdfViewer";

const mocks = vi.hoisted(() => ({
  useKernel: vi.fn(),
  usePdfViewer: vi.fn(),
  useVfs: vi.fn(() => ({ stat: vi.fn(), read: vi.fn() })),
}));

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
    }),
  );
}

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
}

function menuItem(label: string): Element {
  const item = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(item).not.toBeUndefined();
  return item!;
}

function sheetOption(label: string): Element {
  const item = Array.from(queryActiveModalDialog()?.querySelectorAll('[role="option"]') ?? []).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  expect(item).not.toBeUndefined();
  return item!;
}

function toolbarRect(width: number, height = 44): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubToolbarLayout(options: { readonly controlsWidth: number }): void {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function clientWidth() {
    const el = this as HTMLElement;
    if (el.classList.contains("pdf-viewer__controls")) {
      return options.controlsWidth;
    }
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect() {
    const el = this as HTMLElement;
    if (el.classList.contains("pdf-viewer__page-group")) {
      return toolbarRect(196);
    }
    if (el.classList.contains("ds-kit-icon-button")) {
      return toolbarRect(44);
    }
    return toolbarRect(0, 0);
  });
}

vi.mock("./usePdfViewer", () => ({
  usePdfViewer: mocks.usePdfViewer,
}));

// App.vue resolves `useVfs` + `AppContextInjectionKey` from the same `@daopk/sdk`
// chunk, so override only `useVfs` and keep every other real export intact.
vi.mock("@daopk/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@daopk/sdk")>()),
  useKernel: mocks.useKernel,
  useVfs: mocks.useVfs,
}));

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "pdf-viewer",
    handleId: "pdf-viewer-handle",
    args: Object.freeze(args),
  });
}

function makeKernel() {
  return {
    events: {
      emit: vi.fn(),
    },
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

function mountPdfViewer(
  viewer: PdfViewerBindings,
  context = makeContext(),
  kernel = makeKernel(),
  options: { readonly appChrome?: AppChromeController; readonly attachTo?: HTMLElement } = {},
) {
  mocks.usePdfViewer.mockReturnValue(viewer);
  mocks.useKernel.mockReturnValue(kernel);
  const provide: Record<symbol, unknown> = {
    [AppContextInjectionKey as symbol]: context,
  };
  if (options.appChrome !== undefined) {
    provide[AppChromeInjectionKey as symbol] = options.appChrome;
  }
  return mount(App, {
    attachTo: options.attachTo,
    global: {
      provide,
    },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(async () => {
  await finishLeavingModals();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PDF Viewer App.vue", () => {
  it("renders the empty state by default", () => {
    const viewer = makeViewer();
    const wrapper = mountPdfViewer(viewer);

    expect(wrapper.text()).toContain("Choose file");
    expect(wrapper.text()).not.toContain("Open a PDF");
    const chooseFileIcon = wrapper.find<SVGElement>(".pdf-viewer__empty button svg");
    expect(chooseFileIcon.attributes("width")).toBe("1em");
    expect(chooseFileIcon.attributes("height")).toBe("1em");
    expect(wrapper.find(".pdf-viewer__toolbar").exists()).toBe(false);
    expect(wrapper.find(".pdf-viewer__status").exists()).toBe(false);
    expect(wrapper.find(".pdf-viewer__page").attributes("style")).toContain("display: none");
    expect(mocks.usePdfViewer).toHaveBeenCalledWith({
      vfs: expect.anything(),
      initialPath: undefined,
    });

    wrapper.unmount();
  });

  it("wires trackpad pinch zoom to the rendered viewport", async () => {
    const viewer = makeViewer({ pageCount: 1, status: "ready", sourceKind: "vfs" });
    const wrapper = mountPdfViewer(viewer);

    await nextTick();
    await nextTick();

    const viewport = wrapper.find<HTMLElement>(".pdf-viewer__viewport");
    expect(viewer.viewportEl.value).toBe(viewport.element);

    const event = new Event("wheel", { bubbles: true, cancelable: true }) as WheelEvent;
    Object.defineProperties(event, {
      clientX: { value: 120 },
      clientY: { value: 80 },
      ctrlKey: { value: true },
      deltaY: { value: -100 },
    });
    viewport.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(viewer.previewScaleAt).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("passes launch args.path into the viewer composable", () => {
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn(),
    };
    const viewer = makeViewer({
      status: "ready",
      title: "spec.pdf",
      path: "/docs/spec.pdf",
      sourceKind: "vfs",
      pageCount: 2,
    });
    const wrapper = mountPdfViewer(viewer, makeContext({ path: "/docs/spec.pdf" }), makeKernel(), {
      appChrome,
    });

    expect(mocks.usePdfViewer).toHaveBeenCalledWith({
      vfs: expect.anything(),
      initialPath: "/docs/spec.pdf",
    });
    expect(wrapper.find(".pdf-viewer__toolbar").exists()).toBe(true);
    expect(wrapper.find(".pdf-viewer__document").exists()).toBe(false);
    expect(wrapper.find(".pdf-viewer__status").exists()).toBe(false);
    expect(appChrome.setTitle).toHaveBeenLastCalledWith("spec.pdf");

    wrapper.unmount();
  });

  it("emits document path changes for VFS PDFs", async () => {
    const kernel = makeKernel();
    const viewer = makeViewer();
    const wrapper = mountPdfViewer(viewer, makeContext(), kernel);

    expect(kernel.events.emit).toHaveBeenCalledWith("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "pdf-viewer-handle",
      path: null,
    });

    viewer.sourceKind.value = "vfs";
    viewer.path.value = "/docs/spec.pdf";
    await nextTick();

    expect(kernel.events.emit).toHaveBeenLastCalledWith("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "pdf-viewer-handle",
      path: "/docs/spec.pdf",
    });

    viewer.sourceKind.value = "file";
    viewer.path.value = null;
    await nextTick();

    expect(kernel.events.emit).toHaveBeenLastCalledWith("app.document.changed", {
      manifestId: "pdf-viewer",
      handleId: "pdf-viewer-handle",
      path: null,
    });

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
    const viewer = makeViewer({
      status: "ready",
      title: "book.pdf",
      sourceKind: "file",
      pageNumber: 1,
      pageCount: 3,
    });
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

  it("selects pages from the mobile page sheet", async () => {
    const viewer = makeViewer({
      status: "ready",
      title: "book.pdf",
      sourceKind: "file",
      pageNumber: 1,
      pageCount: 3,
    });
    const wrapper = mountPdfViewer(viewer, makeContext(), makeKernel(), {
      attachTo: document.body,
    });

    click(wrapper.get('button[aria-label="Select page 1 / 3"]').element);
    await flushOverlay();

    expect(queryActiveModalDialog()?.querySelector('[role="listbox"]')).toBeInstanceOf(HTMLElement);
    expect(
      Array.from(document.body.querySelectorAll('[role="option"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(["Page 1", "Page 2", "Page 3"]);

    click(sheetOption("Page 2"));
    await flushOverlay();

    expect(viewer.setPage).toHaveBeenCalledWith(2);
    expect(queryActiveModalDialog()?.querySelector('[role="listbox"]') ?? null).toBeNull();

    await finishLeavingModals();
    wrapper.unmount();
  });

  it("wires overflow menu controls to secondary viewer actions", async () => {
    stubToolbarLayout({ controlsWidth: 344 });
    const viewer = makeViewer({
      status: "ready",
      title: "book.pdf",
      sourceKind: "file",
      pageNumber: 1,
      pageCount: 3,
    });
    const wrapper = mountPdfViewer(viewer, makeContext(), makeKernel(), {
      attachTo: document.body,
    });
    const openSpy = vi
      .spyOn(wrapper.get('input[type="file"]').element, "click")
      .mockImplementation(() => {});

    async function openMoreMenu(): Promise<void> {
      await flushOverlay();
      click(wrapper.get('button[aria-label="More PDF tools"]').element);
      await flushOverlay();
    }

    await openMoreMenu();
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(["Open PDF", "Zoom out", "Zoom in", "Fit width", "Rotate clockwise", "Download PDF"]);

    click(menuItem("Open PDF"));
    await flushOverlay();
    await openMoreMenu();
    click(menuItem("Zoom out"));
    await flushOverlay();
    await openMoreMenu();
    click(menuItem("Zoom in"));
    await flushOverlay();
    await openMoreMenu();
    click(menuItem("Fit width"));
    await flushOverlay();
    await openMoreMenu();
    click(menuItem("Rotate clockwise"));
    await flushOverlay();
    await openMoreMenu();
    click(menuItem("Download PDF"));
    await flushOverlay();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(viewer.zoomOut).toHaveBeenCalledTimes(1);
    expect(viewer.zoomIn).toHaveBeenCalledTimes(1);
    expect(viewer.fitWidth).toHaveBeenCalledTimes(1);
    expect(viewer.rotateClockwise).toHaveBeenCalledTimes(1);
    expect(viewer.download).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("shows viewer errors", () => {
    const viewer = makeViewer({ status: "error", error: "PDF Viewer can only open PDF files." });
    const wrapper = mountPdfViewer(viewer);

    expect(wrapper.find('[role="alert"]').text()).toContain("PDF Viewer can only open PDF files.");

    wrapper.unmount();
  });
});
