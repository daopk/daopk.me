<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, toRef } from "vue";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@daopk/ui";
import { AppContextInjectionKey, NOTES_ROOT, useKernel, useVfs, type VfsPath } from "@daopk/sdk";

import {
  NOTES_AUTOSAVE_DEBOUNCE_MS,
  NOTES_MIME_TYPE,
  noteSource,
  parseNoteSource,
} from "./useNotes";
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
const vfs = useVfs();
const appContext = inject(AppContextInjectionKey, null);
const pinnedNotes = usePinnedDesktopNotes();

const title = ref("");
const body = ref("");
const savedSource = ref("");
const status = ref<"loading" | "saved" | "unsaved" | "saving" | "error">("loading");
const dragging = ref<{ x: number; y: number } | null>(null);

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let savePromise: Promise<void> | undefined;

const position = computed(() => dragging.value ?? { x: props.note.x, y: props.note.y });
const { noteColor, noteStyle } = useDesktopStickyNoteTheme({
  note: toRef(props, "note"),
  position,
});

const statusText = computed(() => {
  switch (status.value) {
    case "loading":
      return "Loading...";
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved";
    case "saving":
      return "Saving...";
    case "error":
      return "Could not save";
  }
  return "";
});

const stopVfsChanged = kernel.events.on("vfs.changed", (payload) => {
  if (payload.path === props.note.path && status.value !== "unsaved" && status.value !== "saving") {
    void loadNote();
  }
});

const stopWillKill = kernel.events.on("app.will-kill", (payload) => {
  if (payload.handleId !== appContext?.handleId) {
    return;
  }

  payload.waitUntil(flushAutosave());
});

onMounted(() => {
  void loadNote();
});

onUnmounted(() => {
  stopVfsChanged();
  stopWillKill();
  clearAutosave();
  void flushAutosave();
});

async function loadNote(): Promise<void> {
  status.value = "loading";
  const source = await vfs.readText(props.note.path);
  if (source === null) {
    emit("missing", props.note.path);
    return;
  }

  const parsed = parseNoteSource(source, props.note.path);
  title.value = parsed.title;
  body.value = parsed.body;
  savedSource.value = source;
  status.value = "saved";
}

function currentSource(): string {
  return noteSource(title.value, body.value);
}

function markUnsaved(): void {
  if (currentSource() === savedSource.value) {
    status.value = "saved";
    clearAutosave();
    return;
  }

  status.value = "unsaved";
  scheduleAutosave();
}

function scheduleAutosave(): void {
  clearAutosave();
  autosaveTimer = setTimeout(() => {
    autosaveTimer = undefined;
    void flushAutosave();
  }, NOTES_AUTOSAVE_DEBOUNCE_MS);
}

function clearAutosave(): void {
  if (autosaveTimer !== undefined) {
    clearTimeout(autosaveTimer);
    autosaveTimer = undefined;
  }
}

async function flushAutosave(): Promise<void> {
  clearAutosave();
  if (savePromise !== undefined) {
    await savePromise;
  }
  if (currentSource() === savedSource.value) {
    status.value = "saved";
    return;
  }

  const nextSource = currentSource();
  status.value = "saving";
  savePromise = (async () => {
    const stat = await vfs.writeText(props.note.path, nextSource, {
      overwrite: true,
      mimeType: NOTES_MIME_TYPE,
    });
    if (stat === null) {
      status.value = "error";
      return;
    }

    savedSource.value = nextSource;
    status.value = "saved";
  })();

  try {
    await savePromise;
  } finally {
    savePromise = undefined;
  }
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
  const titleInput = event.currentTarget as HTMLInputElement;
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
          <input
            v-model="title"
            class="desktop-sticky-note__title"
            aria-label="Note title"
            spellcheck="true"
            @input="markUnsaved"
            @pointerdown.stop="startTitleDrag"
          />
          <span class="desktop-sticky-note__status">{{ statusText }}</span>
        </header>

        <textarea
          v-model="body"
          class="desktop-sticky-note__body"
          aria-label="Note body"
          spellcheck="true"
          @input="markUnsaved"
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
            :style="{ '--desktop-sticky-note-dot': option.swatch }"
            :aria-label="`Change note color to ${option.label}`"
            :data-selected="noteColor === option.id || undefined"
          />
        </ContextMenuItem>
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem @select="openInNotes">Open in Notes</ContextMenuItem>
      <ContextMenuItem @select="revealInFinder">Reveal in Finder</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="removeFromDesktop">Remove from Desktop</ContextMenuItem>
    </template>
  </ContextMenu>
</template>

<style scoped lang="scss" src="./styles/desktop-sticky-note.scss"></style>
