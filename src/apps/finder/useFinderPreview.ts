import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";

import { createMarkdownRenderer } from "~/core/markdown/createMarkdownRenderer";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import { VfsError } from "~/core/vfs/errors";
import {
  detectVfsFileType,
  normalizedVfsMimeType,
  type VfsRenderableFileType,
} from "~/core/vfs/fileTypes";
import type { VfsDirEntry } from "~/core/vfs/nodes";

export type FinderPreviewKind =
  | "empty"
  | "directory"
  | "markdown"
  | "text"
  | "image"
  | "pdf"
  | "unsupported"
  | "too-large"
  | "error"
  | "permission-denied";

export interface FinderPreviewVfsClient {
  read(path: string): Promise<Uint8Array | null>;
  readText(path: string): Promise<string | null>;
}

export interface FinderPreviewBindings {
  readonly kind: Ref<FinderPreviewKind>;
  readonly loading: Ref<boolean>;
  readonly path: Ref<string | null>;
  readonly title: Ref<string>;
  readonly message: Ref<string>;
  readonly html: Ref<string>;
  readonly text: Ref<string>;
  readonly imageUrl: Ref<string>;
  load(entry: VfsDirEntry | null): Promise<void>;
  dispose(): void;
}

export interface UseFinderPreviewOptions {
  readonly vfs: FinderPreviewVfsClient;
  readonly createRenderer?: () => Promise<MarkdownRenderer>;
}

export const FINDER_TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
export const FINDER_IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

export function useFinderPreview({
  vfs,
  createRenderer = createMarkdownRenderer,
}: UseFinderPreviewOptions): FinderPreviewBindings {
  const kind = ref<FinderPreviewKind>("empty");
  const loading = ref(false);
  const path = ref<string | null>(null);
  const title = ref("");
  const message = ref("Select a file or folder to preview it.");
  const html = ref("");
  const text = ref("");
  const imageUrl = ref("");

  let disposed = false;
  let previewRun = 0;
  let renderer: MarkdownRenderer | undefined;
  let rendererPromise: Promise<MarkdownRenderer> | undefined;
  let activeObjectUrl = "";

  async function getRenderer(): Promise<MarkdownRenderer> {
    if (renderer !== undefined) {
      return renderer;
    }

    rendererPromise ??= createRenderer();
    const next = await rendererPromise;

    if (disposed) {
      next.dispose();
      throw new Error("Finder preview renderer resolved after dispose.");
    }

    renderer = next;
    return next;
  }

  function reset(entry: VfsDirEntry | null): void {
    revokeObjectUrl();
    path.value = entry?.path ?? null;
    title.value = entry?.name ?? "";
    message.value = "";
    html.value = "";
    text.value = "";
    imageUrl.value = "";
  }

  async function load(entry: VfsDirEntry | null): Promise<void> {
    const run = ++previewRun;
    reset(entry);

    if (entry === null) {
      kind.value = "empty";
      message.value = "Select a file or folder to preview it.";
      loading.value = false;
      return;
    }

    if (entry.kind === "directory") {
      kind.value = "directory";
      message.value = "Folder";
      loading.value = false;
      return;
    }

    if (entry.kind !== "file") {
      kind.value = "unsupported";
      message.value = "Finder cannot preview this item type yet.";
      loading.value = false;
      return;
    }

    const previewType = detectPreviewType(entry);
    if (previewType === "unsupported") {
      kind.value = "unsupported";
      message.value = unsupportedMessage(entry);
      loading.value = false;
      return;
    }

    if (previewType === "pdf") {
      kind.value = "pdf";
      message.value = "Open this document in PDF Viewer.";
      loading.value = false;
      return;
    }

    if (
      (previewType === "text" || previewType === "markdown") &&
      entry.size > FINDER_TEXT_PREVIEW_MAX_BYTES
    ) {
      kind.value = "too-large";
      message.value = "This file is too large to preview.";
      loading.value = false;
      return;
    }

    if (previewType === "image" && entry.size > FINDER_IMAGE_PREVIEW_MAX_BYTES) {
      kind.value = "too-large";
      message.value = "This image is too large to preview.";
      loading.value = false;
      return;
    }

    loading.value = true;

    try {
      if (previewType === "markdown") {
        const source = await vfs.readText(entry.path);
        if (run !== previewRun || disposed) {
          return;
        }
        if (source === null) {
          setPermissionDenied();
          return;
        }

        const activeRenderer = await getRenderer();
        const result = await activeRenderer.render(source);
        if (run !== previewRun || disposed) {
          return;
        }

        kind.value = "markdown";
        html.value = result.html;
        return;
      }

      if (previewType === "text") {
        const source = await vfs.readText(entry.path);
        if (run !== previewRun || disposed) {
          return;
        }
        if (source === null) {
          setPermissionDenied();
          return;
        }

        kind.value = "text";
        text.value = source;
        return;
      }

      const bytes = await vfs.read(entry.path);
      if (run !== previewRun || disposed) {
        return;
      }
      if (bytes === null) {
        setPermissionDenied();
        return;
      }

      if (!canCreateObjectUrl()) {
        kind.value = "unsupported";
        message.value = "Image preview is unavailable in this environment.";
        return;
      }

      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const blob = new Blob([buffer], {
        type: normalizedVfsMimeType(entry) ?? "application/octet-stream",
      });
      activeObjectUrl = URL.createObjectURL(blob);
      imageUrl.value = activeObjectUrl;
      kind.value = "image";
    } catch (previewError) {
      if (run === previewRun && !disposed) {
        kind.value = "error";
        message.value = messageFromError(previewError);
      }
    } finally {
      if (run === previewRun && !disposed) {
        loading.value = false;
      }
    }
  }

  function setPermissionDenied(): void {
    kind.value = "permission-denied";
    message.value = "Finder does not have permission to preview this file.";
  }

  function revokeObjectUrl(): void {
    if (activeObjectUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(activeObjectUrl);
    }
    activeObjectUrl = "";
  }

  function dispose(): void {
    disposed = true;
    previewRun += 1;
    revokeObjectUrl();
    renderer?.dispose();
    renderer = undefined;
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(dispose);
  }

  return {
    kind,
    loading,
    path,
    title,
    message,
    html,
    text,
    imageUrl,
    load,
    dispose,
  };
}

export function detectPreviewType(entry: VfsDirEntry): VfsRenderableFileType {
  return detectVfsFileType(entry);
}

function unsupportedMessage(entry: VfsDirEntry): string {
  const mimeType = normalizedVfsMimeType(entry);
  return mimeType === undefined
    ? "Finder cannot preview this file yet."
    : `Finder cannot preview ${mimeType} files yet.`;
}

function canCreateObjectUrl(): boolean {
  return (
    typeof Blob === "function" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function"
  );
}

function messageFromError(error: unknown): string {
  if (error instanceof VfsError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}
