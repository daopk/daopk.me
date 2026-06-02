import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { basename, normalizeVfsPath } from "~/core/vfs/path";
import type { VfsDirEntry } from "~/core/vfs/nodes";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";

import {
  FINDER_IMAGE_PREVIEW_MAX_BYTES,
  FINDER_TEXT_PREVIEW_MAX_BYTES,
  detectPreviewType,
  useFinderPreview,
  type FinderPreviewVfsClient,
} from "./useFinderPreview";

function entry(path: string, options: Partial<VfsDirEntry> = {}): VfsDirEntry {
  const normalized = normalizeVfsPath(path);
  return {
    name: basename(normalized),
    path: normalized,
    kind: "file",
    size: 12,
    updatedAt: 0,
    readonly: false,
    ...options,
  };
}

type FinderPreviewVfsMock = FinderPreviewVfsClient & {
  read: ReturnType<typeof vi.fn<FinderPreviewVfsClient["read"]>>;
  readText: ReturnType<typeof vi.fn<FinderPreviewVfsClient["readText"]>>;
};

function makeVfs(overrides: Partial<FinderPreviewVfsClient> = {}): FinderPreviewVfsMock {
  return {
    read: vi.fn<FinderPreviewVfsClient["read"]>(async () => new Uint8Array([1, 2, 3])),
    readText: vi.fn<FinderPreviewVfsClient["readText"]>(async () => "hello"),
    ...overrides,
  } as FinderPreviewVfsMock;
}

function makeRenderer(): MarkdownRenderer & {
  render: ReturnType<typeof vi.fn<MarkdownRenderer["render"]>>;
  dispose: ReturnType<typeof vi.fn<MarkdownRenderer["dispose"]>>;
} {
  return {
    ready: Promise.resolve(),
    render: vi.fn<MarkdownRenderer["render"]>(async (source) => ({ html: `<p>${source}</p>` })),
    dispose: vi.fn<MarkdownRenderer["dispose"]>(),
  };
}

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("useFinderPreview", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:finder-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    vi.restoreAllMocks();
  });

  it("detects markdown, text, raster image, PDF, and unsupported files", () => {
    expect(detectPreviewType(entry("/note.md"))).toBe("markdown");
    expect(detectPreviewType(entry("/data.json"))).toBe("text");
    expect(detectPreviewType(entry("/photo.png", { mimeType: "image/png" }))).toBe("image");
    expect(detectPreviewType(entry("/paper.pdf", { mimeType: "application/pdf" }))).toBe("pdf");
    expect(detectPreviewType(entry("/vector.svg", { mimeType: "image/svg+xml" }))).toBe(
      "unsupported",
    );
  });

  it("renders markdown through the supplied renderer", async () => {
    const renderer = makeRenderer();
    const preview = useFinderPreview({
      vfs: makeVfs({ readText: vi.fn(async () => "# Hello") }),
      createRenderer: vi.fn(async () => renderer),
    });

    await preview.load(entry("/hello.md", { mimeType: "text/markdown" }));

    expect(renderer.render).toHaveBeenCalledWith("# Hello");
    expect(preview.kind.value).toBe("markdown");
    expect(preview.html.value).toBe("<p># Hello</p>");

    preview.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("renders text as text and skips files over the preview cap", async () => {
    const vfs = makeVfs();
    const preview = useFinderPreview({ vfs });

    await preview.load(entry("/log.txt"));

    expect(preview.kind.value).toBe("text");
    expect(preview.text.value).toBe("hello");

    await preview.load(entry("/huge.txt", { size: FINDER_TEXT_PREVIEW_MAX_BYTES + 1 }));

    expect(preview.kind.value).toBe("too-large");
    expect(vfs.readText).toHaveBeenCalledTimes(1);
  });

  it("applies the text preview cap to markdown before reading", async () => {
    const vfs = makeVfs();
    const preview = useFinderPreview({ vfs });

    await preview.load(
      entry("/huge.md", {
        mimeType: "text/markdown",
        size: FINDER_TEXT_PREVIEW_MAX_BYTES + 1,
      }),
    );

    expect(preview.kind.value).toBe("too-large");
    expect(vfs.readText).not.toHaveBeenCalled();
  });

  it("creates and revokes object URLs for raster images", async () => {
    const preview = useFinderPreview({ vfs: makeVfs() });

    await preview.load(
      entry("/photo.png", {
        mimeType: "image/png",
        size: FINDER_IMAGE_PREVIEW_MAX_BYTES,
      }),
    );

    expect(preview.kind.value).toBe("image");
    expect(preview.imageUrl.value).toBe("blob:finder-preview");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    await preview.load(null);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:finder-preview");
  });

  it("reports PDFs as openable without reading bytes", async () => {
    const vfs = makeVfs();
    const preview = useFinderPreview({ vfs });

    await preview.load(entry("/paper.pdf", { mimeType: "application/pdf" }));

    expect(preview.kind.value).toBe("pdf");
    expect(preview.message.value).toMatch(/PDF Viewer/);
    expect(vfs.read).not.toHaveBeenCalled();
    expect(vfs.readText).not.toHaveBeenCalled();
  });

  it("does not read images over the preview cap", async () => {
    const vfs = makeVfs();
    const preview = useFinderPreview({ vfs });

    await preview.load(
      entry("/large.webp", {
        mimeType: "image/webp",
        size: FINDER_IMAGE_PREVIEW_MAX_BYTES + 1,
      }),
    );

    expect(preview.kind.value).toBe("too-large");
    expect(vfs.read).not.toHaveBeenCalled();
  });

  it("surfaces permission denial from read APIs", async () => {
    const preview = useFinderPreview({
      vfs: makeVfs({ readText: vi.fn(async () => null) }),
    });

    await preview.load(entry("/private.txt"));

    expect(preview.kind.value).toBe("permission-denied");
    expect(preview.message.value).toMatch(/permission/i);
  });
});
