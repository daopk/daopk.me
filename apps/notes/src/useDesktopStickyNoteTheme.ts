import { computed, type ComputedRef, type Ref } from "vue";

import {
  DEFAULT_PINNED_DESKTOP_NOTE_COLOR,
  PINNED_DESKTOP_NOTE_COLORS,
  type PinnedDesktopNote,
  type PinnedDesktopNoteColor,
} from "./usePinnedDesktopNotes";

export const NOTE_WIDTH = 260;
export const NOTE_HEIGHT = 228;

interface StickyNoteColorTheme {
  readonly background: string;
  readonly border: string;
  readonly foreground: string;
  readonly label: string;
  readonly muted: string;
  readonly swatch: string;
}

const STICKY_NOTE_COLOR_THEMES: Record<PinnedDesktopNoteColor, StickyNoteColorTheme> = {
  blue: {
    background:
      "linear-gradient(180deg, rgba(205, 234, 255, 0.96), rgba(157, 210, 248, 0.94)), #a7d9fb",
    border: "rgba(38, 86, 132, 0.24)",
    foreground: "#12324f",
    label: "Blue",
    muted: "rgba(18, 50, 79, 0.62)",
    swatch: "#73bdf4",
  },
  green: {
    background:
      "linear-gradient(180deg, rgba(213, 244, 219, 0.96), rgba(169, 224, 178, 0.94)), #b4e5bd",
    border: "rgba(45, 105, 56, 0.24)",
    foreground: "#173d21",
    label: "Green",
    muted: "rgba(23, 61, 33, 0.62)",
    swatch: "#82cf8e",
  },
  purple: {
    background:
      "linear-gradient(180deg, rgba(228, 220, 255, 0.96), rgba(199, 186, 246, 0.94)), #cfc2fa",
    border: "rgba(76, 55, 134, 0.24)",
    foreground: "#2d2251",
    label: "Purple",
    muted: "rgba(45, 34, 81, 0.62)",
    swatch: "#a995ee",
  },
  rose: {
    background:
      "linear-gradient(180deg, rgba(255, 214, 228, 0.96), rgba(249, 177, 203, 0.94)), #f8b5cb",
    border: "rgba(136, 43, 76, 0.24)",
    foreground: "#4a1730",
    label: "Rose",
    muted: "rgba(74, 23, 48, 0.62)",
    swatch: "#f38caf",
  },
  yellow: {
    background:
      "linear-gradient(180deg, rgba(255, 247, 179, 0.96), rgba(255, 236, 139, 0.94)), #ffed8a",
    border: "rgba(120, 96, 20, 0.22)",
    foreground: "#332b0d",
    label: "Yellow",
    muted: "rgba(51, 43, 13, 0.6)",
    swatch: "#ffdc4d",
  },
};

export const colorOptions = PINNED_DESKTOP_NOTE_COLORS.map((id) => ({
  id,
  ...STICKY_NOTE_COLOR_THEMES[id],
}));

interface UseDesktopStickyNoteThemeOptions {
  readonly note: Readonly<Ref<PinnedDesktopNote>>;
  readonly position: ComputedRef<{ readonly x: number; readonly y: number }>;
}

export function useDesktopStickyNoteTheme({ note, position }: UseDesktopStickyNoteThemeOptions) {
  const noteColor = computed(() => note.value.color ?? DEFAULT_PINNED_DESKTOP_NOTE_COLOR);
  const noteTheme = computed(() => STICKY_NOTE_COLOR_THEMES[noteColor.value]);
  const noteStyle = computed(() => ({
    blockSize: `${NOTE_HEIGHT}px`,
    inlineSize: `${NOTE_WIDTH}px`,
    transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
    zIndex: String(note.value.z),
    "--desktop-sticky-note-bg": noteTheme.value.background,
    "--desktop-sticky-note-border": noteTheme.value.border,
    "--desktop-sticky-note-fg": noteTheme.value.foreground,
    "--desktop-sticky-note-muted": noteTheme.value.muted,
  }));

  return {
    noteColor,
    noteStyle,
    noteTheme,
  };
}
