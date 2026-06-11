import { computed, onUnmounted, ref, watch } from "vue";

import { createMarkdownRenderer, type MarkdownRenderer } from "@daopk/markdown";

import type { EditorBindings } from "../useEditor";

export function useEditorPreview(editor: EditorBindings) {
  const previewHtml = ref("");
  const previewLoading = ref(false);
  const previewMessage = ref("");

  let previewRun = 0;
  let disposed = false;
  let renderer: MarkdownRenderer | undefined;
  let rendererPromise: Promise<MarkdownRenderer> | undefined;

  const canPreview = computed(
    () => editor.currentPath.value !== null && editor.editableKind.value === "markdown",
  );
  const bodyClasses = computed(() => ({
    "editor__body--split": editor.previewOpen.value && canPreview.value,
  }));

  watch(
    () => [editor.previewOpen.value, editor.draft.value, editor.editableKind.value] as const,
    () => {
      void renderPreview();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    disposed = true;
    previewRun += 1;
    renderer?.dispose();
    renderer = undefined;
  });

  async function getRenderer(): Promise<MarkdownRenderer> {
    if (renderer !== undefined) {
      return renderer;
    }

    rendererPromise ??= createMarkdownRenderer();
    const next = await rendererPromise;
    if (disposed) {
      next.dispose();
      throw new Error("Editor preview renderer resolved after dispose.");
    }

    renderer = next;
    return next;
  }

  async function renderPreview(): Promise<void> {
    const run = ++previewRun;
    previewHtml.value = "";
    previewMessage.value = "";

    if (!editor.previewOpen.value) {
      previewLoading.value = false;
      return;
    }
    if (!canPreview.value) {
      previewLoading.value = false;
      previewMessage.value = "Preview is available for Markdown files.";
      return;
    }

    previewLoading.value = true;
    try {
      const activeRenderer = await getRenderer();
      const result = await activeRenderer.render(editor.draft.value);
      if (run !== previewRun || disposed) {
        return;
      }

      previewHtml.value = result.html;
    } catch (error) {
      if (run === previewRun && !disposed) {
        previewMessage.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (run === previewRun && !disposed) {
        previewLoading.value = false;
      }
    }
  }

  function togglePreview(): void {
    editor.setPreviewOpen(!editor.previewOpen.value);
  }

  return {
    bodyClasses,
    canPreview,
    previewHtml,
    previewLoading,
    previewMessage,
    togglePreview,
  };
}
