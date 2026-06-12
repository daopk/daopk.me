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
import {
  DEFAULT_PINNED_DESKTOP_NOTE_COLOR,
  PINNED_DESKTOP_NOTE_COLORS,
  type PinnedDesktopNote,
  type PinnedDesktopNoteColor,
  usePinnedDesktopNotes,
} from "./usePinnedDesktopNotes";

const NOTE_WIDTH = 260;
const NOTE_HEIGHT = 228;
const DRAG_CLICK_THRESHOLD_PX = 3;

interface StickyNoteColorTheme {
  readonly label: string;
  readonly background: string;
  readonly border: string;
  readonly foreground: string;
  readonly muted: string;
  readonly swatch: string;
}

const STICKY_NOTE_COLOR_THEMES: Record<PinnedDesktopNoteColor, StickyNoteColorTheme> = {
  yellow: {
    label: "Yellow",
    background:
      "linear-gradient(180deg, rgba(255, 247, 179, 0.96), rgba(255, 236, 139, 0.94)), #ffed8a",
    border: "rgba(120, 96, 20, 0.22)",
    foreground: "#332b0d",
    muted: "rgba(51, 43, 13, 0.6)",
    swatch: "#ffdc4d",
  },
  rose: {
    label: "Rose",
    background:
      "linear-gradient(180deg, rgba(255, 214, 228, 0.96), rgba(249, 177, 203, 0.94)), #f8b5cb",
    border: "rgba(136, 43, 76, 0.24)",
    foreground: "#4a1730",
    muted: "rgba(74, 23, 48, 0.62)",
    swatch: "#f38caf",
  },
  blue: {
    label: "Blue",
    background:
      "linear-gradient(180deg, rgba(205, 234, 255, 0.96), rgba(157, 210, 248, 0.94)), #a7d9fb",
    border: "rgba(38, 86, 132, 0.24)",
    foreground: "#12324f",
    muted: "rgba(18, 50, 79, 0.62)",
    swatch: "#73bdf4",
  },
  green: {
    label: "Green",
    background:
      "linear-gradient(180deg, rgba(213, 244, 219, 0.96), rgba(169, 224, 178, 0.94)), #b4e5bd",
    border: "rgba(45, 105, 56, 0.24)",
    foreground: "#173d21",
    muted: "rgba(23, 61, 33, 0.62)",
    swatch: "#82cf8e",
  },
  purple: {
    label: "Purple",
    background:
      "linear-gradient(180deg, rgba(228, 220, 255, 0.96), rgba(199, 186, 246, 0.94)), #cfc2fa",
    border: "rgba(76, 55, 134, 0.24)",
    foreground: "#2d2251",
    muted: "rgba(45, 34, 81, 0.62)",
    swatch: "#a995ee",
  },
};

const colorOptions = PINNED_DESKTOP_NOTE_COLORS.map((id) => ({
  id,
  ...STICKY_NOTE_COLOR_THEMES[id],
}));

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
const noteColor = computed(() => props.note.color ?? DEFAULT_PINNED_DESKTOP_NOTE_COLOR);
const noteTheme = computed(() => STICKY_NOTE_COLOR_THEMES[noteColor.value]);
const noteStyle = computed(() => ({
  inlineSize: `${NOTE_WIDTH}px`,
  blockSize: `${NOTE_HEIGHT}px`,
  transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
  zIndex: String(props.note.z),
  "--desktop-sticky-note-bg": noteTheme.value.background,
  "--desktop-sticky-note-border": noteTheme.value.border,
  "--desktop-sticky-note-fg": noteTheme.value.foreground,
  "--desktop-sticky-note-muted": noteTheme.value.muted,
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

<style scoped lang="scss">
.desktop-sticky-note {
  background: var(--desktop-sticky-note-bg);
  border: 1px solid var(--desktop-sticky-note-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 18px 42px rgba(35, 30, 16, 0.22);
  color: var(--desktop-sticky-note-fg);
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
  cursor: grab;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
}

.desktop-sticky-note[data-dragging] .desktop-sticky-note__title {
  cursor: grabbing;
}

.desktop-sticky-note__status {
  color: var(--desktop-sticky-note-muted);
  font-size: 11px;
  line-height: 1.2;
}

.desktop-sticky-note__body {
  line-height: 1.5;
  min-block-size: 0;
  padding: 0 12px 12px;
  resize: none;
}

.desktop-sticky-note__color-menu {
  align-items: center;
  display: flex;
  gap: 8px;
  padding: 6px 8px 7px;
}

.desktop-sticky-note__color-dot[role="menuitem"] {
  background: var(--desktop-sticky-note-dot);
  block-size: 20px;
  border: 1px solid color-mix(in srgb, var(--color-fg) 18%, transparent);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.42);
  cursor: pointer;
  display: block;
  flex: 0 0 auto;
  gap: 0;
  inline-size: 20px;
  line-height: 1;
  min-block-size: 20px;
  padding: 0;
  transition:
    box-shadow var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
}

.desktop-sticky-note__color-dot[role="menuitem"]:hover,
.desktop-sticky-note__color-dot[role="menuitem"][data-highlighted] {
  background: var(--desktop-sticky-note-dot);
  transform: scale(1.08);
}

.desktop-sticky-note__color-dot[role="menuitem"][data-selected] {
  box-shadow:
    0 0 0 2px var(--color-bg-elevated),
    0 0 0 4px var(--color-accent),
    inset 0 0 0 1px rgba(255, 255, 255, 0.42);
}

@media (pointer: coarse) {
  .desktop-sticky-note__color-dot[role="menuitem"] {
    min-block-size: 28px;
  }
}
</style>
