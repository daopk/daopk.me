import { computed, ref, type ComputedRef, type Ref } from "vue";

import { VfsError } from "~/core/vfs/errors";
import {
  defaultTextMimeTypeForPath,
  detectVfsFileType,
  isEditableVfsTextFile,
  vfsFileTypeInputFromPath,
  type VfsRenderableFileType,
} from "~/core/vfs/fileTypes";
import type { VfsStat } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";

export type EditorStatus = "idle" | "loading" | "new" | "ready" | "saving" | "saved" | "error";
export type EditorEditableKind = Extract<VfsRenderableFileType, "markdown" | "text">;

export interface EditorVfsClient {
  stat(path: string): Promise<VfsStat | null>;
  readText(path: string): Promise<string | null>;
  writeText(
    path: string,
    text: string,
    options?: { overwrite?: boolean; mimeType?: string },
  ): Promise<VfsStat | null>;
}

export interface EditorBindings {
  readonly currentPath: Ref<string | null>;
  readonly draft: Ref<string>;
  readonly savedText: Ref<string>;
  readonly stat: Ref<VfsStat | null>;
  readonly missing: Ref<boolean>;
  readonly previewOpen: Ref<boolean>;
  readonly status: Ref<EditorStatus>;
  readonly error: Ref<string | null>;
  readonly dirty: ComputedRef<boolean>;
  readonly readOnly: ComputedRef<boolean>;
  readonly loading: ComputedRef<boolean>;
  readonly saving: ComputedRef<boolean>;
  readonly editableKind: ComputedRef<EditorEditableKind | null>;
  readonly canSave: ComputedRef<boolean>;
  openPath(path: string): Promise<boolean>;
  save(): Promise<boolean>;
  revert(): void;
  setDraft(text: string): void;
  setPreviewOpen(open: boolean): void;
}

export interface UseEditorOptions {
  readonly vfs: EditorVfsClient;
}

export function useEditor({ vfs }: UseEditorOptions): EditorBindings {
  const currentPath = ref<string | null>(null);
  const draft = ref("");
  const savedText = ref("");
  const stat = ref<VfsStat | null>(null);
  const missing = ref(false);
  const previewOpen = ref(false);
  const status = ref<EditorStatus>("idle");
  const error = ref<string | null>(null);
  let openRun = 0;
  let saveRun = 0;

  const dirty = computed(() => draft.value !== savedText.value);
  const readOnly = computed(() => stat.value?.readonly === true);
  const loading = computed(() => status.value === "loading");
  const saving = computed(() => status.value === "saving");
  const editableKind = computed<EditorEditableKind | null>(() => {
    const path = currentPath.value;
    if (path === null) {
      return null;
    }

    const kind = detectVfsFileType(vfsFileTypeInputFromPath(path, stat.value?.mimeType));
    return kind === "markdown" || kind === "text" ? kind : null;
  });
  const canSave = computed(
    () =>
      currentPath.value !== null &&
      editableKind.value !== null &&
      !readOnly.value &&
      !loading.value &&
      !saving.value &&
      (dirty.value || missing.value),
  );

  async function openPath(path: string): Promise<boolean> {
    const run = ++openRun;
    let normalized: string;

    try {
      normalized = normalizeVfsPath(path);
    } catch (openError) {
      if (run === openRun) {
        fail(messageFromError(openError));
      }
      return false;
    }

    status.value = "loading";
    error.value = null;

    try {
      const nextStat = await vfs.stat(normalized);
      if (run !== openRun) {
        return false;
      }
      if (nextStat === null) {
        fail("Editor does not have permission to open this path.");
        return false;
      }
      if (nextStat.kind === "directory") {
        fail("Editor cannot edit folders.");
        return false;
      }
      if (nextStat.kind !== "file") {
        fail("Editor cannot edit this item type yet.");
        return false;
      }
      if (!isEditableVfsTextFile(vfsFileTypeInputFromPath(normalized, nextStat.mimeType))) {
        fail(unsupportedMessage(normalized, nextStat.mimeType));
        return false;
      }

      const source = await vfs.readText(normalized);
      if (run !== openRun) {
        return false;
      }
      if (source === null) {
        fail("Editor does not have permission to read this file.");
        return false;
      }

      currentPath.value = normalized;
      draft.value = source;
      savedText.value = source;
      stat.value = nextStat;
      missing.value = false;
      status.value = "ready";
      error.value = null;
      return true;
    } catch (openError) {
      if (run !== openRun) {
        return false;
      }

      if (openError instanceof VfsError && openError.code === "NOT_FOUND") {
        if (!isEditableVfsTextFile(vfsFileTypeInputFromPath(normalized))) {
          fail(unsupportedMessage(normalized));
          return false;
        }

        currentPath.value = normalized;
        draft.value = "";
        savedText.value = "";
        stat.value = null;
        missing.value = true;
        status.value = "new";
        error.value = null;
        return true;
      }

      fail(messageFromError(openError));
      return false;
    }
  }

  async function save(): Promise<boolean> {
    const path = currentPath.value;
    if (path === null || editableKind.value === null) {
      fail("Open a text file before saving.");
      return false;
    }
    if (readOnly.value) {
      fail("This file is read-only.");
      return false;
    }

    const run = ++saveRun;
    status.value = "saving";
    error.value = null;

    try {
      const nextStat = await vfs.writeText(path, draft.value, {
        overwrite: !missing.value,
        mimeType: defaultTextMimeTypeForPath(path, stat.value?.mimeType),
      });
      if (run !== saveRun || currentPath.value !== path) {
        return false;
      }
      if (nextStat === null) {
        status.value = missing.value ? "new" : "ready";
        error.value = "Editor does not have permission to save this file.";
        return false;
      }

      stat.value = nextStat;
      savedText.value = draft.value;
      missing.value = false;
      status.value = "saved";
      error.value = null;
      return true;
    } catch (saveError) {
      if (run === saveRun && currentPath.value === path) {
        status.value = missing.value ? "new" : "ready";
        error.value = messageFromError(saveError, "save");
      }
      return false;
    }
  }

  function revert(): void {
    draft.value = savedText.value;
    error.value = null;
    status.value = currentPath.value === null ? "idle" : missing.value ? "new" : "ready";
  }

  function setDraft(text: string): void {
    draft.value = text;
  }

  function setPreviewOpen(open: boolean): void {
    previewOpen.value = open;
  }

  function fail(message: string): void {
    error.value = message;
    status.value = "error";
  }

  return {
    currentPath,
    draft,
    savedText,
    stat,
    missing,
    previewOpen,
    status,
    error,
    dirty,
    readOnly,
    loading,
    saving,
    editableKind,
    canSave,
    openPath,
    save,
    revert,
    setDraft,
    setPreviewOpen,
  };
}

function unsupportedMessage(path: string, mimeType?: string): string {
  return mimeType === undefined
    ? `Editor cannot edit ${path}.`
    : `Editor cannot edit ${mimeType} files.`;
}

function messageFromError(error: unknown, operation: "open" | "save" = "open"): string {
  if (error instanceof VfsError) {
    switch (error.code) {
      case "INVALID_PATH":
        return "That path is not valid.";
      case "NOT_FOUND":
        return operation === "save"
          ? "The parent folder does not exist."
          : "Editor could not find that path.";
      case "ALREADY_EXISTS":
        return "A file already exists at this path. Reopen it before saving.";
      case "NOT_DIRECTORY":
        return "The parent path is not a folder.";
      case "IS_DIRECTORY":
        return "Editor cannot edit folders.";
      case "READ_ONLY":
        return "This file is read-only.";
      case "PERMISSION_DENIED":
        return "Editor does not have permission for this file.";
      case "MOUNT_NOT_FOUND":
        return "No filesystem is mounted for that path.";
      case "ADAPTER_UNAVAILABLE":
        return "That filesystem is unavailable right now.";
      case "CONFLICT":
        return error.message;
    }
  }

  return error instanceof Error ? error.message : String(error);
}
