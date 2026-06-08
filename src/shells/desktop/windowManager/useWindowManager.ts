import { reactive, readonly, type DeepReadonly } from "vue";

export type SnapEdge = "left" | "right" | "max";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowRecord {
  id: string;
  manifestId: string;
  handleId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  z: number;
  focused: boolean;
  singleton: boolean;
  maximized: boolean;
  minimized: boolean;
  argsRevision: number;
  preMaximize?: WindowBounds;
  snap?: SnapEdge;
  args?: Readonly<Record<string, unknown>>;
  documentPath?: string | null;
  browserPath?: string | null;
}

export interface OpenWindowInput {
  manifestId: string;
  handleId: string;
  title: string;
  initial?: { x: number; y: number };
  size?: { width: number; height: number };
  minSize?: { width?: number; height?: number };
  singleton?: boolean;
  args?: Readonly<Record<string, unknown>>;
}

export interface WindowManagerDeps {
  killProcess: (handleId: string) => void;
}

export interface StageSize {
  width: number;
  height: number;
}

export interface WindowManagerApi {
  windows: DeepReadonly<WindowRecord[]>;
  open(input: OpenWindowInput): string;
  close(id: string): void;
  focus(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, width: number, height: number): void;
  setBounds(id: string, x: number, y: number, width: number, height: number): void;
  toggleMaximize(id: string, stage: StageSize): void;
  snapTo(id: string, edge: SnapEdge, stage: StageSize): void;
  rebindToStage(stage: StageSize): void;
  minimize(id: string): void;
  restore(id: string): void;
  removeByHandleId(handleId: string): boolean;
  setTitle(id: string, title: string): boolean;
  setArgs(id: string, args?: Readonly<Record<string, unknown>>): boolean;
  setDocumentPath(handleId: string, manifestId: string, path: string | null): boolean;
  setBrowserPath(handleId: string, manifestId: string, path: string | null): boolean;
  restoreAllForManifest(manifestId: string): boolean;
  focusTopOfManifest(manifestId: string): boolean;
  hasWindowsForManifest(manifestId: string): boolean;
}

/**
 * Pixel height of the titlebar — TS mirror of `--window-titlebar-h` in
 * `_tokens.scss`. Used by `Window.vue` for off-stage clamping. Update both
 * when changing the chrome height.
 */
export const TITLEBAR_HEIGHT = 28;
/** Initial z floor — must match `--window-z-base` in `_tokens.scss`. */
export const WINDOW_Z_BASE = 100;
export const WINDOW_Z_MAX = 800;
export const DEFAULT_W = 360;
export const DEFAULT_H = 240;
export const MIN_W = 240;
export const MIN_H = 160;

const CASCADE_ORIGIN = { x: 80, y: 80 };
const CASCADE_STEP = 32;
const CASCADE_WRAP = 8;

interface InternalState {
  windows: WindowRecord[];
  nextZ: number;
  cascade: number;
}

const state: InternalState = reactive<InternalState>({
  windows: [],
  nextZ: WINDOW_Z_BASE,
  cascade: 0,
});

let killProcess: WindowManagerDeps["killProcess"] | undefined;

function nextId(manifestId: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${manifestId}-${state.cascade.toString()}-${Date.now().toString()}`;
}

function nextCascadeOffset(): { x: number; y: number } {
  const step = state.cascade % CASCADE_WRAP;
  state.cascade += 1;

  return {
    x: CASCADE_ORIGIN.x + step * CASCADE_STEP,
    y: CASCADE_ORIGIN.y + step * CASCADE_STEP,
  };
}

function bumpZ(): number {
  if (state.nextZ + 1 > WINDOW_Z_MAX) {
    const ordered = [...state.windows].sort((a, b) => a.z - b.z);

    for (let index = 0; index < ordered.length; index += 1) {
      const record = ordered[index]!;
      record.z = WINDOW_Z_BASE + index;
    }

    state.nextZ = WINDOW_Z_BASE + ordered.length;
  } else {
    state.nextZ += 1;
  }

  return state.nextZ;
}

function setFocusedFlag(targetId: string): void {
  for (const record of state.windows) {
    record.focused = record.id === targetId;
  }
}

function open(input: OpenWindowInput): string {
  if (input.singleton === true) {
    const existing = state.windows.find((w) => w.manifestId === input.manifestId);

    if (existing) {
      existing.minimized = false;
      existing.z = bumpZ();
      setFocusedFlag(existing.id);

      return existing.id;
    }
  }

  const position = input.initial ?? nextCascadeOffset();
  const size = input.size ?? { width: DEFAULT_W, height: DEFAULT_H };
  const minWidth = normalizeMinDimension(input.minSize?.width, MIN_W);
  const minHeight = normalizeMinDimension(input.minSize?.height, MIN_H);

  const record: WindowRecord = {
    id: nextId(input.manifestId),
    manifestId: input.manifestId,
    handleId: input.handleId,
    title: input.title,
    x: position.x,
    y: position.y,
    width: Math.max(size.width, minWidth),
    height: Math.max(size.height, minHeight),
    minWidth,
    minHeight,
    z: bumpZ(),
    focused: true,
    singleton: input.singleton === true,
    maximized: false,
    minimized: false,
    argsRevision: 0,
    // Freeze a shallow snapshot so post-`open` mutations on the
    ...(input.args === undefined ? {} : { args: Object.freeze({ ...input.args }) }),
  };

  state.windows.push(record);
  setFocusedFlag(record.id);

  return record.id;
}

function close(id: string): void {
  const index = state.windows.findIndex((w) => w.id === id);

  if (index === -1) {
    return;
  }

  const [removed] = state.windows.splice(index, 1);

  if (removed) {
    killProcess?.(removed.handleId);
  }

  focusTopVisibleWindow();
}

function focusTopVisibleWindow(): void {
  if (state.windows.length === 0) {
    return;
  }

  const visible = state.windows.filter((w) => !w.minimized);

  if (visible.length === 0) {
    for (const record of state.windows) {
      record.focused = false;
    }

    return;
  }

  const top = visible.reduce((acc, w) => (w.z > acc.z ? w : acc), visible[0]!);

  setFocusedFlag(top.id);
}

function removeByHandleId(handleId: string): boolean {
  let removed = false;
  for (let index = state.windows.length - 1; index >= 0; index -= 1) {
    if (state.windows[index]?.handleId === handleId) {
      state.windows.splice(index, 1);
      removed = true;
    }
  }

  if (removed) {
    focusTopVisibleWindow();
  }

  return removed;
}

function setDocumentPath(handleId: string, manifestId: string, path: string | null): boolean {
  const target = state.windows.find((w) => w.handleId === handleId && w.manifestId === manifestId);

  if (!target) {
    return false;
  }

  target.documentPath = path;
  return true;
}

function setBrowserPath(handleId: string, manifestId: string, path: string | null): boolean {
  const target = state.windows.find((w) => w.handleId === handleId && w.manifestId === manifestId);

  if (!target) {
    return false;
  }

  target.browserPath = path;
  return true;
}

function setTitle(id: string, title: string): boolean {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return false;
  }

  target.title = title;
  return true;
}

function argsSnapshotsEqual(
  left: Readonly<Record<string, unknown>> | undefined,
  right: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]),
  );
}

function setArgs(id: string, args?: Readonly<Record<string, unknown>>): boolean {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return false;
  }

  if (argsSnapshotsEqual(target.args, args)) {
    return true;
  }

  if (args === undefined) {
    delete target.args;
  } else {
    target.args = Object.freeze({ ...args });
  }
  target.argsRevision += 1;
  return true;
}

function focus(id: string): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  if (target.minimized) {
    target.minimized = false;
  }

  target.z = bumpZ();
  setFocusedFlag(target.id);
}

function clearSnapState(record: WindowRecord): void {
  record.maximized = false;
  delete record.snap;
  delete record.preMaximize;
}

function move(id: string, x: number, y: number): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  target.x = x;
  target.y = y;

  clearSnapState(target);
}

function resize(id: string, width: number, height: number): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  target.width = Math.max(width, target.minWidth);
  target.height = Math.max(height, target.minHeight);

  clearSnapState(target);
}

function setBounds(id: string, x: number, y: number, width: number, height: number): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  target.x = x;
  target.y = y;
  target.width = Math.max(width, target.minWidth);
  target.height = Math.max(height, target.minHeight);

  clearSnapState(target);
}

function captureMaximizeBounds(target: WindowRecord, stage: StageSize): void {
  if (target.preMaximize === undefined) {
    target.preMaximize = {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
    };
  }

  applyBoundsToRecord(target, snapEdgeToBounds("max", stage));
  target.maximized = true;
  target.snap = "max";
}

function toggleMaximize(id: string, stage: StageSize): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  if (target.maximized) {
    const previous = target.preMaximize ?? {
      x: target.x,
      y: target.y,
      width: target.minWidth,
      height: target.minHeight,
    };
    target.x = previous.x;
    target.y = previous.y;
    target.width = Math.max(previous.width, target.minWidth);
    target.height = Math.max(previous.height, target.minHeight);
    target.maximized = false;
    delete target.preMaximize;
    delete target.snap;

    return;
  }

  captureMaximizeBounds(target, stage);
}

export function snapEdgeToBounds(edge: SnapEdge, stage: StageSize): WindowBounds {
  if (edge === "max") {
    return { x: 0, y: 0, width: stage.width, height: stage.height };
  }

  const halfWidth = Math.floor(stage.width / 2);

  if (edge === "left") {
    return { x: 0, y: 0, width: halfWidth, height: stage.height };
  }

  return { x: stage.width - halfWidth, y: 0, width: halfWidth, height: stage.height };
}

function snapTo(id: string, edge: SnapEdge, stage: StageSize): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  if (edge === "max") {
    if (target.maximized) {
      return;
    }
    captureMaximizeBounds(target, stage);

    return;
  }

  if (target.snap === undefined && !target.maximized) {
    target.preMaximize = {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
    };
  }

  applyBoundsToRecord(target, snapEdgeToBounds(edge, stage));
  target.maximized = false;
  target.snap = edge;
}

function applyBoundsToRecord(record: WindowRecord, bounds: WindowBounds): void {
  record.x = bounds.x;
  record.y = bounds.y;
  record.width = bounds.width;
  record.height = bounds.height;
}

function normalizeMinDimension(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(fallback, value) : fallback;
}

function rebindToStage(stage: StageSize): void {
  if (stage.width <= 0 || stage.height <= 0) {
    return;
  }

  for (const record of state.windows) {
    if (record.maximized) {
      applyBoundsToRecord(record, snapEdgeToBounds("max", stage));

      continue;
    }

    if (record.snap === "left" || record.snap === "right") {
      applyBoundsToRecord(record, snapEdgeToBounds(record.snap, stage));
    }
  }
}

function minimize(id: string): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target || target.minimized) {
    return;
  }

  target.minimized = true;
  target.focused = false;

  const visible = state.windows.filter((w) => !w.minimized);

  if (visible.length === 0) {
    return;
  }

  const top = visible.reduce((acc, w) => (w.z > acc.z ? w : acc), visible[0]!);

  setFocusedFlag(top.id);
}

function restore(id: string): void {
  const target = state.windows.find((w) => w.id === id);

  if (!target) {
    return;
  }

  target.minimized = false;
  target.z = bumpZ();
  setFocusedFlag(target.id);
}

function restoreAllForManifest(manifestId: string): boolean {
  const minimized = state.windows
    .filter((w) => w.manifestId === manifestId && w.minimized)
    .sort((a, b) => a.z - b.z);

  if (minimized.length === 0) {
    return false;
  }

  for (const record of minimized) {
    record.minimized = false;
    record.z = bumpZ();
  }

  setFocusedFlag(minimized[minimized.length - 1]!.id);

  return true;
}

function focusTopOfManifest(manifestId: string): boolean {
  const visible = state.windows.filter((w) => w.manifestId === manifestId && !w.minimized);

  if (visible.length === 0) {
    return false;
  }

  const top = visible.reduce((acc, w) => (w.z > acc.z ? w : acc), visible[0]!);

  focus(top.id);

  return true;
}

function hasWindowsForManifest(manifestId: string): boolean {
  return state.windows.some((w) => w.manifestId === manifestId);
}

export function useWindowManager(deps?: WindowManagerDeps): WindowManagerApi {
  if (deps) {
    killProcess = deps.killProcess;
  }

  return {
    windows: readonly(state.windows) as DeepReadonly<WindowRecord[]>,
    open,
    close,
    focus,
    move,
    resize,
    setBounds,
    toggleMaximize,
    snapTo,
    rebindToStage,
    minimize,
    restore,
    removeByHandleId,
    setTitle,
    setArgs,
    setDocumentPath,
    setBrowserPath,
    restoreAllForManifest,
    focusTopOfManifest,
    hasWindowsForManifest,
  };
}

export function __resetWindowManagerForTests(): void {
  state.windows.splice(0, state.windows.length);
  state.nextZ = WINDOW_Z_BASE;
  state.cascade = 0;
  killProcess = undefined;
}
