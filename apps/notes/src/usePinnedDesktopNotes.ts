import { ref, type Ref } from "vue";

import { activeProfileKvNamespace, KVStore, normalizeVfsPath, type VfsPath } from "@daopk/sdk";

export const PINNED_DESKTOP_NOTE_COLORS = ["yellow", "rose", "blue", "green", "purple"] as const;

export type PinnedDesktopNoteColor = (typeof PINNED_DESKTOP_NOTE_COLORS)[number];

export const DEFAULT_PINNED_DESKTOP_NOTE_COLOR: PinnedDesktopNoteColor = "yellow";

export interface PinnedDesktopNote {
  readonly path: VfsPath;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: PinnedDesktopNoteColor;
}

interface PinnedDesktopNotesState {
  notes: readonly PinnedDesktopNote[];
}

export interface PinDesktopNoteOptions {
  readonly x?: number;
  readonly y?: number;
  readonly color?: PinnedDesktopNoteColor;
}

export interface PinnedDesktopNotesStore {
  readonly notes: Ref<readonly PinnedDesktopNote[]>;
  hydrate(): void;
  isHydrated(): boolean;
  pin(path: string, options?: PinDesktopNoteOptions): VfsPath;
  unpin(path: string): void;
  move(path: string, x: number, y: number): void;
  raise(path: string): void;
  setColor(path: string, color: PinnedDesktopNoteColor): void;
  dispose(): void;
}

const NOTES_DESKTOP_KV_NAMESPACE = "notes-desktop";
const NOTES_DESKTOP_KV_PRIMARY_KEY = "pinned";
const DEFAULT_X = 32;
const DEFAULT_Y = 32;
const PINNED_DESKTOP_NOTE_COLOR_SET = new Set<string>(PINNED_DESKTOP_NOTE_COLORS);

function sanitizeCoordinate(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback;
}

function sanitizeColor(value: unknown): PinnedDesktopNoteColor {
  return typeof value === "string" && PINNED_DESKTOP_NOTE_COLOR_SET.has(value)
    ? (value as PinnedDesktopNoteColor)
    : DEFAULT_PINNED_DESKTOP_NOTE_COLOR;
}

function coerceState(value: unknown): PinnedDesktopNotesState {
  if (typeof value !== "object" || value === null) {
    return { notes: [] };
  }

  const rawNotes = (value as Partial<PinnedDesktopNotesState>).notes;
  if (!Array.isArray(rawNotes)) {
    return { notes: [] };
  }

  const notes: PinnedDesktopNote[] = [];
  for (const rawNote of rawNotes) {
    if (typeof rawNote !== "object" || rawNote === null) {
      continue;
    }
    const candidate = rawNote as Partial<PinnedDesktopNote>;
    if (typeof candidate.path !== "string") {
      continue;
    }

    try {
      notes.push({
        path: normalizeVfsPath(candidate.path),
        x: sanitizeCoordinate(candidate.x, DEFAULT_X),
        y: sanitizeCoordinate(candidate.y, DEFAULT_Y),
        z: sanitizeCoordinate(candidate.z, 1),
        color: sanitizeColor(candidate.color),
      });
    } catch {
      continue;
    }
  }

  return { notes: sortByZ(dedupeByPath(notes)) };
}

function dedupeByPath(notes: readonly PinnedDesktopNote[]): readonly PinnedDesktopNote[] {
  const byPath = new Map<VfsPath, PinnedDesktopNote>();
  for (const note of notes) {
    byPath.set(note.path, note);
  }
  return [...byPath.values()];
}

function sortByZ(notes: readonly PinnedDesktopNote[]): readonly PinnedDesktopNote[] {
  return [...notes].sort((a, b) => a.z - b.z || a.path.localeCompare(b.path));
}

function nextZ(notes: readonly PinnedDesktopNote[]): number {
  return notes.reduce((max, note) => Math.max(max, note.z), 0) + 1;
}

const notes = ref<readonly PinnedDesktopNote[]>([]);
let kv: KVStore<PinnedDesktopNotesState> | undefined;

function persist(): void {
  kv?.set(NOTES_DESKTOP_KV_PRIMARY_KEY, { notes: notes.value });
}

function loadFromKv(): void {
  notes.value = coerceState(kv?.get(NOTES_DESKTOP_KV_PRIMARY_KEY)).notes;
}

function hydrate(): void {
  kv?.dispose();
  kv = new KVStore<PinnedDesktopNotesState>(activeProfileKvNamespace(NOTES_DESKTOP_KV_NAMESPACE), {
    version: 1,
    onRemoteChange: loadFromKv,
  });
  loadFromKv();
}

function ensureHydrated(): void {
  if (kv === undefined) {
    hydrate();
  }
}

function pin(path: string, options: PinDesktopNoteOptions = {}): VfsPath {
  ensureHydrated();
  const normalized = normalizeVfsPath(path);
  const existing = notes.value.find((note) => note.path === normalized);
  const z = nextZ(notes.value);
  const next: PinnedDesktopNote = {
    path: normalized,
    x: sanitizeCoordinate(options.x, existing?.x ?? DEFAULT_X),
    y: sanitizeCoordinate(options.y, existing?.y ?? DEFAULT_Y),
    z,
    color: options.color ?? existing?.color ?? DEFAULT_PINNED_DESKTOP_NOTE_COLOR,
  };

  notes.value = sortByZ([...notes.value.filter((note) => note.path !== normalized), next]);
  persist();
  return normalized;
}

function unpin(path: string): void {
  ensureHydrated();
  const normalized = normalizeVfsPath(path);
  const next = notes.value.filter((note) => note.path !== normalized);
  if (next.length === notes.value.length) {
    return;
  }

  notes.value = next;
  persist();
}

function move(path: string, x: number, y: number): void {
  ensureHydrated();
  const normalized = normalizeVfsPath(path);
  let changed = false;
  notes.value = notes.value.map((note) => {
    if (note.path !== normalized) {
      return note;
    }

    const next = {
      ...note,
      x: sanitizeCoordinate(x, note.x),
      y: sanitizeCoordinate(y, note.y),
    };
    changed = next.x !== note.x || next.y !== note.y;
    return next;
  });

  if (changed) {
    persist();
  }
}

function raise(path: string): void {
  ensureHydrated();
  const normalized = normalizeVfsPath(path);
  const z = nextZ(notes.value);
  let changed = false;
  notes.value = sortByZ(
    notes.value.map((note) => {
      if (note.path !== normalized || note.z === z) {
        return note;
      }
      changed = true;
      return { ...note, z };
    }),
  );

  if (changed) {
    persist();
  }
}

function setColor(path: string, color: PinnedDesktopNoteColor): void {
  ensureHydrated();
  const normalized = normalizeVfsPath(path);
  let changed = false;
  notes.value = notes.value.map((note) => {
    if (note.path !== normalized || note.color === color) {
      return note;
    }

    changed = true;
    return { ...note, color };
  });

  if (changed) {
    persist();
  }
}

function dispose(): void {
  kv?.dispose();
  kv = undefined;
}

export function usePinnedDesktopNotes(): PinnedDesktopNotesStore {
  return {
    notes,
    hydrate,
    isHydrated: () => kv !== undefined,
    pin,
    unpin,
    move,
    raise,
    setColor,
    dispose,
  };
}
