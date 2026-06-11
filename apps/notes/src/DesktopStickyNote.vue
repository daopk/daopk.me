<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from "vue";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@daopk/ui";
import { AppContextInjectionKey, NOTES_ROOT, useKernel, useVfs, type VfsPath } from "@daopk/sdk";

import {
  NOTES_AUTOSAVE_DEBOUNCE_MS,
  NOTES_MIME_TYPE,
  noteSource,
  parseNoteSource,
} from "./useNotes";
import { type PinnedDesktopNote, usePinnedDesktopNotes } from "./usePinnedDesktopNotes";

const NOTE_WIDTH = 260;
const NOTE_HEIGHT = 228;

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
const noteStyle = computed(() => ({
  inlineSize: `${NOTE_WIDTH}px`,
  blockSize: `${NOTE_HEIGHT}px`,
  transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
  zIndex: String(props.note.z),
}));

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

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  raise();
  const startX = event.clientX;
  const startY = event.clientY;
  const origin = { x: props.note.x, y: props.note.y };

  const move = (next: PointerEvent): void => {
    dragging.value = {
      x: clampX(origin.x + next.clientX - startX),
      y: clampY(origin.y + next.clientY - startY),
    };
    next.preventDefault();
  };

  const end = (): void => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    if (dragging.value !== null) {
      pinnedNotes.move(props.note.path, dragging.value.x, dragging.value.y);
    }
    dragging.value = null;
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  event.preventDefault();
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
            @pointerdown.stop
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
      <ContextMenuItem @select="openInNotes">Open in Notes</ContextMenuItem>
      <ContextMenuItem @select="revealInFinder">Reveal in Finder</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="removeFromDesktop">Remove from Desktop</ContextMenuItem>
    </template>
  </ContextMenu>
</template>

<style scoped lang="scss">
.desktop-sticky-note {
  background:
    linear-gradient(180deg, rgba(255, 247, 179, 0.96), rgba(255, 236, 139, 0.94)), #ffed8a;
  border: 1px solid rgba(120, 96, 20, 0.22);
  border-radius: var(--radius-sm);
  box-shadow: 0 18px 42px rgba(35, 30, 16, 0.22);
  color: #332b0d;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  inset: 0 auto auto 0;
  overflow: hidden;
  position: absolute;
  user-select: none;
}

.desktop-sticky-note[data-dragging] {
  cursor: grabbing;
}

.desktop-sticky-note__header {
  cursor: grab;
  display: grid;
  gap: 2px;
  padding: 10px 12px 8px;
}

.desktop-sticky-note__title,
.desktop-sticky-note__body {
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  inline-size: 100%;
  min-inline-size: 0;
  outline: none;
  user-select: text;
}

.desktop-sticky-note__title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
}

.desktop-sticky-note__status {
  color: rgba(51, 43, 13, 0.6);
  font-size: 11px;
  line-height: 1.2;
}

.desktop-sticky-note__body {
  line-height: 1.5;
  min-block-size: 0;
  padding: 0 12px 12px;
  resize: none;
}
</style>
