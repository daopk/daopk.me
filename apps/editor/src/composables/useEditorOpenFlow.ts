import { nextTick, onUnmounted, ref, watch } from "vue";

import type { AppContext, Kernel } from "@daopk/sdk";

import type { EditorBindings } from "../useEditor";

type PendingDiscardAction = { kind: "open"; path: string } | { kind: "revert" };
type EditorTextareaRef = { focus: (options?: FocusOptions) => void };

export interface UseEditorOpenFlowOptions {
  readonly beforeRequestOpenPath?: () => void;
  readonly ctx: AppContext | null;
  readonly editor: EditorBindings;
  readonly kernel: Kernel;
}

export function useEditorOpenFlow({
  beforeRequestOpenPath,
  ctx,
  editor,
  kernel,
}: UseEditorOpenFlowOptions) {
  const textareaRef = ref<EditorTextareaRef | null>(null);
  const discardDialogOpen = ref(false);
  const pendingDiscardAction = ref<PendingDiscardAction | null>(null);
  const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : "";

  const stopOpenRequests = kernel.events.on("editor.window.open.requested", (payload) => {
    if (payload.handleId !== ctx?.handleId) {
      return;
    }

    requestOpenPath(payload.path);
  });

  void openInitialPath();

  watch(
    editor.currentPath,
    (path) => {
      emitDocumentPath(path);
    },
    { immediate: initialPath.length === 0 },
  );

  onUnmounted(() => {
    stopOpenRequests();
  });

  async function openInitialPath(): Promise<void> {
    if (initialPath.length === 0) {
      return;
    }

    await openNow(initialPath);
    if (editor.currentPath.value === null) {
      emitDocumentPath(null);
    }
  }

  function emitDocumentPath(path: string | null): void {
    if (ctx === null) {
      return;
    }

    kernel.events.emit("app.document.changed", {
      manifestId: ctx.manifestId,
      handleId: ctx.handleId,
      path,
    });
  }

  function requestOpenPath(path: string): void {
    const nextPath = path.trim();
    if (nextPath.length === 0) {
      return;
    }

    beforeRequestOpenPath?.();
    if (editor.dirty.value) {
      pendingDiscardAction.value = { kind: "open", path: nextPath };
      discardDialogOpen.value = true;
      return;
    }

    void openNow(nextPath);
  }

  async function openNow(path: string): Promise<void> {
    const opened = await editor.openPath(path);
    if (!opened) {
      return;
    }

    await nextTick();
    textareaRef.value?.focus({ preventScroll: true });
  }

  function requestRevert(): void {
    if (!editor.dirty.value) {
      editor.revert();
      return;
    }

    pendingDiscardAction.value = { kind: "revert" };
    discardDialogOpen.value = true;
  }

  function confirmDiscard(): void {
    const action = pendingDiscardAction.value;
    pendingDiscardAction.value = null;
    discardDialogOpen.value = false;

    if (action?.kind === "open") {
      void openNow(action.path);
      return;
    }
    if (action?.kind === "revert") {
      editor.revert();
    }
  }

  function cancelDiscard(): void {
    pendingDiscardAction.value = null;
    discardDialogOpen.value = false;
  }

  function save(): void {
    void editor.save();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (editor.canSave.value) {
        void editor.save();
      }
    }
  }

  return {
    cancelDiscard,
    confirmDiscard,
    discardDialogOpen,
    onKeydown,
    requestOpenPath,
    requestRevert,
    save,
    textareaRef,
  };
}
