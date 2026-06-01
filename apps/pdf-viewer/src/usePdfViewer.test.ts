import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";

import {
  detectVfsFileType,
  normalizeVfsPath,
  vfsFileTypeInputFromPath,
  type VfsStat,
} from "@daopk/sdk";

import {
  isPdfFile,
  usePdfViewer,
  type PdfDocumentLike,
  type PdfLoadingTaskLike,
  type PdfPageLike,
  type PdfRenderTaskLike,
  type PdfViewerAdapter,
  type PdfViewerBindings,
  type PdfViewerVfsClient,
} from "./usePdfViewer";

function stat(path: string, options: Partial<VfsStat> = {}): VfsStat {
  return {
    path: normalizeVfsPath(path),
    kind: "file",
    size: 12,
    createdAt: 0,
    updatedAt: 0,
    readonly: false,
    mimeType: "application/pdf",
    ...options,
  };
}

function makeVfs(
  options: {
    stats?: Record<string, VfsStat | null>;
    reads?: Record<string, Uint8Array | null>;
  } = {},
): PdfViewerVfsClient & {
  stat: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    stat: vi.fn(async (path: string) =>
      Object.prototype.hasOwnProperty.call(options.stats ?? {}, path)
        ? options.stats![path]!
        : stat(path),
    ),
    read: vi.fn(async (path: string) =>
      Object.prototype.hasOwnProperty.call(options.reads ?? {}, path)
        ? options.reads![path]!
        : new Uint8Array([1, 2, 3]),
    ),
  };
}

function makeRenderTask(promise: Promise<void> = Promise.resolve()): PdfRenderTaskLike & {
  cancel: ReturnType<typeof vi.fn>;
} {
  return {
    promise,
    cancel: vi.fn(),
  };
}

function makePage(renderTask = makeRenderTask()): PdfPageLike & {
  getViewport: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
} {
  return {
    getViewport: vi.fn(({ scale = 1 }: { scale?: number; rotation?: number } = {}) => ({
      width: 600 * scale,
      height: 800 * scale,
    })),
    render: vi.fn(() => renderTask),
  };
}

function makeDocument(
  page = makePage(),
  numPages = 3,
): PdfDocumentLike & {
  getPage: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    numPages,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(async () => undefined),
  };
}

function makeLoadingTask(document: PdfDocumentLike): PdfLoadingTaskLike & {
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    promise: Promise.resolve(document),
    destroy: vi.fn(async () => undefined),
  };
}

function makeAdapter(task = makeLoadingTask(makeDocument())): PdfViewerAdapter & {
  loadDocument: ReturnType<typeof vi.fn>;
} {
  return {
    loadDocument: vi.fn(async () => task),
  };
}

function harness(
  options: {
    vfs?: PdfViewerVfsClient;
    adapter?: PdfViewerAdapter;
    initialPath?: string;
  } = {},
): { viewer: PdfViewerBindings; unmount: () => void } {
  let viewer: PdfViewerBindings | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        viewer = usePdfViewer({
          vfs: options.vfs ?? makeVfs(),
          adapter: options.adapter ?? makeAdapter(),
          initialPath: options.initialPath,
        });
        return () => null;
      },
    }),
  );

  if (viewer === undefined) {
    throw new Error("Failed to mount PDF viewer harness.");
  }

  return { viewer, unmount: () => wrapper.unmount() };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("PDF file detection", () => {
  it("detects PDFs by extension and MIME type", () => {
    expect(detectVfsFileType(vfsFileTypeInputFromPath("/docs/spec.pdf"))).toBe("pdf");
    expect(detectVfsFileType(vfsFileTypeInputFromPath("/download", "application/pdf"))).toBe("pdf");
    expect(isPdfFile("report.pdf")).toBe(true);
    expect(isPdfFile("report.txt", "text/plain")).toBe(false);
  });
});

describe("usePdfViewer", () => {
  it("loads a PDF from VFS bytes", async () => {
    const document = makeDocument();
    const task = makeLoadingTask(document);
    const adapter = makeAdapter(task);
    const { viewer, unmount } = harness({ adapter });

    await viewer.loadFromPath("/docs/spec.pdf");

    expect(adapter.loadDocument).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(viewer.status.value).toBe("ready");
    expect(viewer.sourceKind.value).toBe("vfs");
    expect(viewer.title.value).toBe("spec.pdf");
    expect(viewer.path.value).toBe("/docs/spec.pdf");
    expect(viewer.pageNumber.value).toBe(1);
    expect(viewer.pageCount.value).toBe(3);
    expect(document.getPage).toHaveBeenCalledWith(1);

    unmount();
  });

  it("loads a PDF from a local File without writing to VFS", async () => {
    const vfs = makeVfs();
    const adapter = makeAdapter();
    const { viewer, unmount } = harness({ vfs, adapter });
    const file = new File([new Uint8Array([9, 8, 7])], "local.pdf", {
      type: "application/pdf",
    });

    await viewer.loadFromFile(file);

    expect(vfs.write).toBeUndefined();
    expect(vfs.read).not.toHaveBeenCalled();
    expect(adapter.loadDocument).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
    expect(viewer.sourceKind.value).toBe("file");
    expect(viewer.title.value).toBe("local.pdf");

    unmount();
  });

  it("rejects non-PDF VFS paths and files before loading PDF.js", async () => {
    const adapter = makeAdapter();
    const vfs = makeVfs({
      stats: {
        "/docs/readme.txt": stat("/docs/readme.txt", { mimeType: "text/plain" }),
      },
    });
    const { viewer, unmount } = harness({ vfs, adapter });

    await expect(viewer.loadFromPath("/docs/readme.txt")).resolves.toBe(false);
    await expect(
      viewer.loadFromFile(new File(["hello"], "readme.txt", { type: "text/plain" })),
    ).resolves.toBe(false);

    expect(adapter.loadDocument).not.toHaveBeenCalled();
    expect(viewer.status.value).toBe("error");
    expect(viewer.error.value).toMatch(/pdf/i);

    unmount();
  });

  it("surfaces permission denial from VFS read APIs", async () => {
    const adapter = makeAdapter();
    const vfs = makeVfs({ stats: { "/private.pdf": null } });
    const { viewer, unmount } = harness({ vfs, adapter });

    await viewer.loadFromPath("/private.pdf");

    expect(adapter.loadDocument).not.toHaveBeenCalled();
    expect(viewer.status.value).toBe("error");
    expect(viewer.error.value).toMatch(/permission/i);

    unmount();
  });

  it("clamps page navigation and updates zoom and rotation", async () => {
    const page = makePage();
    const adapter = makeAdapter(makeLoadingTask(makeDocument(page, 5)));
    const { viewer, unmount } = harness({ adapter });

    await viewer.loadFromPath("/book.pdf");

    expect(viewer.setPage(99)).toBe(true);
    expect(viewer.pageNumber.value).toBe(5);
    expect(viewer.goNext()).toBe(false);
    expect(viewer.goPrevious()).toBe(true);
    expect(viewer.pageNumber.value).toBe(4);

    expect(viewer.zoomIn()).toBe(true);
    expect(viewer.fitMode.value).toBe("custom");
    expect(viewer.scale.value).toBeGreaterThan(1);
    expect(viewer.rotateClockwise()).toBe(true);
    expect(viewer.rotation.value).toBe(90);

    unmount();
  });

  it("calculates fit-width scale from the viewport", async () => {
    const page = makePage();
    const adapter = makeAdapter(makeLoadingTask(makeDocument(page)));
    const { viewer, unmount } = harness({ adapter });
    viewer.viewportEl.value = { clientWidth: 648 } as HTMLElement;

    await viewer.loadFromPath("/wide.pdf");
    await viewer.fitWidth();

    expect(viewer.fitMode.value).toBe("fit-width");
    expect(viewer.scale.value).toBe(1);

    unmount();
  });

  it("reports render errors from the active page", async () => {
    const renderFailure = deferred<void>();
    const renderTask = makeRenderTask(renderFailure.promise);
    const page = makePage(renderTask);
    const adapter = makeAdapter(makeLoadingTask(makeDocument(page)));
    const { viewer, unmount } = harness({ adapter });
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(() => ({
        setTransform: vi.fn(),
        clearRect: vi.fn(),
      })),
    } as unknown as HTMLCanvasElement;
    viewer.canvasEl.value = canvas;

    const load = viewer.loadFromPath("/broken.pdf");
    renderFailure.reject(new Error("render failed"));
    await load;

    expect(viewer.status.value).toBe("error");
    expect(viewer.error.value).toBe("render failed");

    unmount();
  });

  it("cancels stale loads and destroys stale documents", async () => {
    const slow = deferred<PdfDocumentLike>();
    const fastDocument = makeDocument();
    const slowDocument = makeDocument();
    const slowTask: PdfLoadingTaskLike & { destroy: ReturnType<typeof vi.fn> } = {
      promise: slow.promise,
      destroy: vi.fn(async () => undefined),
    };
    const fastTask = makeLoadingTask(fastDocument);
    const adapter: PdfViewerAdapter & { loadDocument: ReturnType<typeof vi.fn> } = {
      loadDocument: vi.fn(async (bytes: Uint8Array) => (bytes[0] === 1 ? slowTask : fastTask)),
    };
    const { viewer, unmount } = harness({
      adapter,
      vfs: makeVfs({
        reads: {
          "/slow.pdf": new Uint8Array([1]),
          "/fast.pdf": new Uint8Array([2]),
        },
      }),
    });

    const first = viewer.loadFromPath("/slow.pdf");
    await Promise.resolve();
    await Promise.resolve();
    expect(adapter.loadDocument).toHaveBeenCalledTimes(1);
    const second = viewer.loadFromPath("/fast.pdf");
    await second;
    slow.resolve(slowDocument);
    await first;

    expect(viewer.title.value).toBe("fast.pdf");
    expect(slowTask.destroy).toHaveBeenCalledTimes(1);
    expect(slowDocument.destroy).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("destroys the active document on dispose", async () => {
    const document = makeDocument();
    const { viewer, unmount } = harness({ adapter: makeAdapter(makeLoadingTask(document)) });

    await viewer.loadFromPath("/book.pdf");
    viewer.dispose();

    expect(document.destroy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("destroys the document loading task when the PDF proxy has no destroy method", async () => {
    let task!: PdfLoadingTaskLike & { destroy: ReturnType<typeof vi.fn> };
    const document: PdfDocumentLike & { getPage: ReturnType<typeof vi.fn> } = {
      numPages: 3,
      get loadingTask() {
        return task;
      },
      getPage: vi.fn(async () => makePage()),
    };
    task = makeLoadingTask(document);
    const { viewer, unmount } = harness({ adapter: makeAdapter(task) });

    await viewer.loadFromPath("/book.pdf");
    viewer.dispose();

    expect(task.destroy).toHaveBeenCalledTimes(1);
    unmount();
  });
});
