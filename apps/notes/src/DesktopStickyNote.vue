<script setup vapor lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, toRef } from "vue";

import {
  ColorSwatch,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  Input,
  Textarea,
} from "@daopk/ui";
import { AppContextInjectionKey, NOTES_ROOT, useKernel, type VfsPath } from "@daopk/sdk";

import { useNoteEditingSession } from "./useNoteEditingSession";
import {
  type PinnedDesktopNote,
  type PinnedDesktopNoteColor,
  usePinnedDesktopNotes,
} from "./usePinnedDesktopNotes";
import {
  colorOptions,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  useDesktopStickyNoteTheme,
} from "./useDesktopStickyNoteTheme";

const DRAG_CLICK_THRESHOLD_PX = 3;

const props = defineProps<{
  note: PinnedDesktopNote;
  stageSize: { width: number; height: number };
}>();

const emit = defineEmits<{
  missing: [path: VfsPath];
}>();

const kernel = useKernel();
const appContext = inject(AppContextInjectionKey, null);
const pinnedNotes = usePinnedDesktopNotes();

const editing = useNoteEditingSession();
const title = editing.title;
const body = editing.body;
const status = editing.status;
const error = editing.error;
const dragging = ref<{ x: number; y: number } | null>(null);

const position = computed(() => dragging.value ?? { x: props.note.x, y: props.note.y });
const editorReadonly = computed(() => editing.path.value === null);
const { noteColor, noteStyle } = useDesktopStickyNoteTheme({
  note: toRef(props, "note"),
  position,
});

const statusText = computed(() => {
  switch (status.value) {
    case "idle":
      return "";
    case "loading":
      return "Loading...";
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved";
    case "saving":
      return "Saving...";
    case "error":
      return error.value ?? "Error";
  }
  return "";
});

const stopVfsChanged = kernel.events.on("vfs.changed", (payload) => {
  if (payload.path === props.note.path && status.value !== "unsaved" && status.value !== "saving") {
    void refreshNote();
  }
});

const stopWillKill = kernel.events.on("app.will-kill", (payload) => {
  if (payload.handleId !== appContext?.handleId) {
    return;
  }

  payload.waitUntil(editing.flush());
});

onMounted(() => {
  void openNote();
});

onUnmounted(() => {
  stopVfsChanged();
  stopWillKill();
  editing.dispose();
});

async function openNote(): Promise<void> {
  const result = await editing.open(props.note.path);
  if (result === "unavailable") {
    emit("missing", props.note.path);
  }
}

async function refreshNote(): Promise<void> {
  const result = await editing.refresh(props.note.path);
  if (result === "unavailable") {
    emit("missing", props.note.path);
  }
}

function updateTitle(value: string): void {
  if (editorReadonly.value) {
    return;
  }

  editing.setTitle(value);
}

function updateBody(value: string): void {
  if (editorReadonly.value) {
    return;
  }

  editing.setBody(value);
}

function clampX(value: number): number {
  return Math.max(0, Math.min(Math.round(value), Math.max(0, props.stageSize.width - NOTE_WIDTH)));
}

function clampY(value: number): number {
  return Math.max(
    0,
    Math.min(Math.round(value), Math.max(0, props.stageSize.height - NOTE_HEIGHT)),
  );
}

function raise(): void {
  pinnedNotes.raise(props.note.path);
}

function startDrag(event: PointerEvent, onClick?: () => void): void {
  if (event.button !== 0) {
    return;
  }

  raise();
  const startX = event.clientX;
  const startY = event.clientY;
  const origin = { x: props.note.x, y: props.note.y };
  let hasDragged = false;

  const move = (next: PointerEvent): void => {
    const deltaX = next.clientX - startX;
    const deltaY = next.clientY - startY;
    if (
      !hasDragged &&
      deltaX * deltaX + deltaY * deltaY < DRAG_CLICK_THRESHOLD_PX * DRAG_CLICK_THRESHOLD_PX
    ) {
      return;
    }

    hasDragged = true;
    dragging.value = {
      x: clampX(origin.x + deltaX),
      y: clampY(origin.y + deltaY),
    };
    next.preventDefault();
  };

  const end = (next: PointerEvent): void => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    if (dragging.value !== null) {
      pinnedNotes.move(props.note.path, dragging.value.x, dragging.value.y);
    } else if (!hasDragged && next.type === "pointerup") {
      onClick?.();
    }
    dragging.value = null;
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  event.preventDefault();
}

function startTitleDrag(event: PointerEvent): void {
  const titleInput = (event.currentTarget as HTMLElement).querySelector("input");
  if (titleInput === null) return;
  startDrag(event, () => {
    titleInput.focus();
    const cursorPosition = titleInput.value.length;
    titleInput.setSelectionRange(cursorPosition, cursorPosition);
  });
}

function openInNotes(): void {
  kernel.events.emit("app.launch.requested", {
    manifestId: "notes",
    source: "api",
    args: { path: props.note.path },
  });
  kernel.events.emit("notes.open.requested", {
    source: "api",
    path: props.note.path,
  });
}

function revealInFinder(): void {
  kernel.events.emit("app.launch.requested", {
    manifestId: "finder",
    source: "api",
    args: { path: NOTES_ROOT, reveal: props.note.path },
  });
}

function removeFromDesktop(): void {
  pinnedNotes.unpin(props.note.path);
}

function setNoteColor(color: PinnedDesktopNoteColor): void {
  pinnedNotes.setColor(props.note.path, color);
}
</script>

<template>
  <div class="desktop-sticky-note__menu-host" style="display: contents">
    <ContextMenu :modal="false">
      <template #trigger>
        <article
          class="desktop-sticky-note"
          data-desktop-renderer-interactive
          :data-dragging="dragging !== null || undefined"
          :style="noteStyle"
          @pointerdown="raise"
        >
          <header class="desktop-sticky-note__header" @pointerdown.stop="startDrag">
            <Input
              class="desktop-sticky-note__title-control"
              :class-names="{ input: 'desktop-sticky-note__title' }"
              :model-value="title"
              :readonly="editorReadonly"
              ariaLabel="Note title"
              :input-attrs="{ spellcheck: true }"
              @update:model-value="updateTitle"
              @pointerdown.stop="startTitleDrag"
            />
            <span class="desktop-sticky-note__status" role="status">{{ statusText }}</span>
          </header>

          <Textarea
            class="desktop-sticky-note__body-control"
            :class-names="{ input: 'desktop-sticky-note__body' }"
            :model-value="body"
            :readonly="editorReadonly"
            ariaLabel="Note body"
            resize="none"
            :input-attrs="{ spellcheck: true }"
            @update:model-value="updateBody"
            @pointerdown.stop
          />
        </article>
      </template>
      <template #items>
        <div class="desktop-sticky-note__color-menu" role="group" aria-label="Note color">
          <ContextMenuItem
            v-for="option in colorOptions"
            :key="option.id"
            as-child
            :text-value="option.label"
            @select="setNoteColor(option.id)"
          >
            <button
              type="button"
              class="desktop-sticky-note__color-dot"
              :aria-label="`Change note color to ${option.label}`"
              :data-selected="noteColor === option.id || undefined"
            >
              <ColorSwatch
                class="desktop-sticky-note__color-swatch"
                :color="option.swatch"
                :size="20"
                aria-hidden="true"
              />
            </button>
          </ContextMenuItem>
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem @select="openInNotes">Open in Notes</ContextMenuItem>
        <ContextMenuItem @select="revealInFinder">Reveal in Finder</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="removeFromDesktop">Remove from Desktop</ContextMenuItem>
      </template>
    </ContextMenu>
  </div>
</template>

<style scoped lang="scss" src="./styles/desktop-sticky-note.scss"></style>
