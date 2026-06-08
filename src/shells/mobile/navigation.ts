import { reactive, readonly, ref, watch, type DeepReadonly, type Ref } from "vue";

import type { Kernel } from "~/types/kernel";
import { debugWarn } from "~/core/debug";

export interface NavigationFrame {
  readonly frameId: string;
  readonly handleId: string;
  readonly manifestId: string;
  readonly args?: Readonly<Record<string, unknown>>;
  documentPath?: string | null;
  browserPath?: string | null;
  title?: string | null;
}

interface NavigationState {
  stack: NavigationFrame[];
}

const state = reactive<NavigationState>({ stack: [] });

const foreground = ref<string | null>(null);

/**
 * Count how many stack frames currently reference `handleId`. Used to
 * gate `kernel.processes.kill` — for singleton manifests with multiple
 * stack frames, the kernel process must outlive every consumer; we only
 * call `kill` when the last frame leaves.
 */
function refsForHandle(handleId: string): number {
  let n = 0;
  for (const frame of state.stack) {
    if (frame.handleId === handleId) {
      n += 1;
    }
  }
  return n;
}

function createFrameId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `frame-${state.stack.length}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

let kernelRef: Kernel | undefined;
let stopForegroundWatcher: (() => void) | undefined;
let initialised = false;

function syncProcessStateOnForegroundChange(
  next: string | null,
  prev: string | null | undefined,
): void {
  if (next === prev) {
    return;
  }

  const prevFrame = typeof prev === "string" ? state.stack.find((f) => f.frameId === prev) : null;
  const nextFrame = typeof next === "string" ? state.stack.find((f) => f.frameId === next) : null;

  const prevHandle = prevFrame?.handleId ?? null;
  const nextHandle = nextFrame?.handleId ?? null;

  if (prevHandle !== null && prevHandle !== nextHandle) {
    kernelRef?.processes.suspend(prevHandle);
  }

  if (nextHandle !== null && nextHandle !== prevHandle) {
    kernelRef?.processes.resume(nextHandle);
  }
}

/** Installs foreground/process state sync. Idempotent. */
function init(kernel: Kernel): void {
  if (initialised) {
    kernelRef = kernel; // refresh binding for tests / HMR
    return;
  }

  kernelRef = kernel;
  initialised = true;

  // on first `init`; survives subsequent `init` calls (HMR refresh) and
  stopForegroundWatcher?.();
  stopForegroundWatcher = watch(foreground, (next, prev) => {
    syncProcessStateOnForegroundChange(next, prev);
  });
}

function dispose(): void {
  // reason to give the bus spurious work during teardown).
  stopForegroundWatcher?.();
  stopForegroundWatcher = undefined;

  // Kill any outstanding processes before clearing local state — HMR
  // teardown otherwise leaks running handles. Best-effort; we already
  while (state.stack.length > 0) {
    const frame = state.stack.pop();
    if (!frame) {
      break;
    }
    if (refsForHandle(frame.handleId) === 0) {
      try {
        // `"shell"` — dispose is the shell-driven teardown path (HMR,
        kernelRef?.processes.kill(frame.handleId, "shell");
      } catch (err) {
        debugWarn("[navigation]", "dispose: kill threw", err);
      }
    }
  }

  foreground.value = null;
  kernelRef = undefined;
  initialised = false;
}

let pushChain: Promise<unknown> = Promise.resolve();

async function doSpawn(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
): Promise<NavigationFrame> {
  const handle = await kernelRef!.apps.launch(manifestId, args);

  // existing frame instead of stacking a duplicate that diverges from the
  const existingByHandle = state.stack.find((f) => f.handleId === handle.id);
  if (existingByHandle) {
    if (args !== undefined) {
      debugWarn("[navigation]", "existingByHandle — dropping spawn args", manifestId, args);
    }
    foreground.value = existingByHandle.frameId;
    return existingByHandle;
  }

  const newFrame: NavigationFrame = {
    frameId: createFrameId(),
    handleId: handle.id,
    manifestId,
    // Freeze a shallow snapshot so a post-spawn caller mutation
    ...(args === undefined ? {} : { args: Object.freeze({ ...args }) }),
  };
  state.stack.push(newFrame);
  foreground.value = newFrame.frameId;
  return newFrame;
}

async function launch(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
): Promise<NavigationFrame> {
  if (!kernelRef) {
    throw new Error("navigation.launch() before init()");
  }

  const previous = pushChain.catch(() => undefined);
  const next = previous.then(async (): Promise<NavigationFrame> => {
    const existingByManifest = state.stack.find((f) => f.manifestId === manifestId);
    if (existingByManifest) {
      if (args !== undefined) {
        debugWarn("[navigation]", "resume — dropping launch args", manifestId, args);
      }
      foreground.value = existingByManifest.frameId;
      return existingByManifest;
    }

    return doSpawn(manifestId, args);
  });

  pushChain = next.catch(() => undefined);
  return next;
}

async function spawnNew(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
): Promise<NavigationFrame> {
  if (!kernelRef) {
    throw new Error("navigation.spawnNew() before init()");
  }

  const previous = pushChain.catch(() => undefined);
  const next = previous.then(() => doSpawn(manifestId, args));
  pushChain = next.catch(() => undefined);
  return next;
}

function goHome(): void {
  if (foreground.value === null) {
    return;
  }
  foreground.value = null;
}

function focusFrame(frameId: string): void {
  if (!kernelRef) {
    throw new Error("navigation.focusFrame() before init()");
  }
  if (foreground.value === frameId) {
    return; // already focused — no-op
  }
  const target = state.stack.find((f) => f.frameId === frameId);
  if (!target) {
    return; // unknown — no-op
  }

  foreground.value = frameId;
}

function dismiss(frameId: string): void {
  if (!kernelRef) {
    throw new Error("navigation.dismiss() before init()");
  }
  const idx = state.stack.findIndex((f) => f.frameId === frameId);
  if (idx === -1) {
    return;
  }

  const [removed] = state.stack.splice(idx, 1);
  const wasForeground = foreground.value === frameId;

  if (wasForeground) {
    const fallback = state.stack.length > 0 ? state.stack[state.stack.length - 1] : null;
    foreground.value = fallback?.frameId ?? null;
  }

  if (refsForHandle(removed.handleId) === 0) {
    try {
      kernelRef?.processes.kill(removed.handleId, "user");
    } catch (err) {
      debugWarn("[navigation]", "dismiss: kill threw", err);
    }
  }
}

function dismissAll(): void {
  if (!kernelRef) {
    throw new Error("navigation.dismissAll() before init()");
  }
  if (state.stack.length === 0) {
    return;
  }

  const removed = state.stack.splice(0, state.stack.length);
  foreground.value = null;

  const killedHandles = new Set<string>();
  for (const frame of removed) {
    if (killedHandles.has(frame.handleId)) {
      continue;
    }
    killedHandles.add(frame.handleId);

    try {
      kernelRef?.processes.kill(frame.handleId, "user");
    } catch (err) {
      debugWarn("[navigation]", "dismissAll: kill threw", err);
    }
  }
}

function removeByHandleId(handleId: string): boolean {
  if (!kernelRef) {
    throw new Error("navigation.removeByHandleId() before init()");
  }

  let removedForeground = false;
  let removed = false;
  for (let index = state.stack.length - 1; index >= 0; index -= 1) {
    const frame = state.stack[index];
    if (frame?.handleId !== handleId) {
      continue;
    }

    removed = true;
    removedForeground ||= foreground.value === frame.frameId;
    state.stack.splice(index, 1);
  }

  if (!removed) {
    return false;
  }

  if (removedForeground) {
    const fallback = state.stack.length > 0 ? state.stack[state.stack.length - 1] : null;
    foreground.value = fallback?.frameId ?? null;
  }

  return true;
}

function setDocumentPath(handleId: string, manifestId: string, path: string | null): boolean {
  const frame = state.stack.find(
    (entry) => entry.handleId === handleId && entry.manifestId === manifestId,
  );

  if (frame === undefined) {
    return false;
  }

  frame.documentPath = path;
  return true;
}

function setBrowserPath(handleId: string, manifestId: string, path: string | null): boolean {
  const frame = state.stack.find(
    (entry) => entry.handleId === handleId && entry.manifestId === manifestId,
  );

  if (frame === undefined) {
    return false;
  }

  frame.browserPath = path;
  return true;
}

function setTitle(handleId: string, manifestId: string, title: string | null): boolean {
  const frame = state.stack.find(
    (entry) => entry.handleId === handleId && entry.manifestId === manifestId,
  );

  if (frame === undefined) {
    return false;
  }

  frame.title = title;
  return true;
}

export interface NavigationOrchestrator {
  readonly stack: DeepReadonly<NavigationFrame[]>;
  readonly foreground: Readonly<Ref<string | null>>;
  init(kernel: Kernel): void;
  dispose(): void;
  launch(manifestId: string, args?: Readonly<Record<string, unknown>>): Promise<NavigationFrame>;
  goHome(): void;
  focusFrame(frameId: string): void;
  dismiss(frameId: string): void;
  dismissAll(): void;
  removeByHandleId(handleId: string): boolean;
  setDocumentPath(handleId: string, manifestId: string, path: string | null): boolean;
  setBrowserPath(handleId: string, manifestId: string, path: string | null): boolean;
  setTitle(handleId: string, manifestId: string, title: string | null): boolean;
  spawnNew(manifestId: string, args?: Readonly<Record<string, unknown>>): Promise<NavigationFrame>;
}

export const navigation: NavigationOrchestrator = {
  get stack() {
    return readonly(state.stack);
  },
  get foreground() {
    return readonly(foreground);
  },
  init,
  dispose,
  launch,
  goHome,
  focusFrame,
  dismiss,
  dismissAll,
  removeByHandleId,
  setDocumentPath,
  setBrowserPath,
  setTitle,
  spawnNew,
};

/**
 * Test-only hook. Resets the singleton between tests; do not call from
 * app code. Exported via the `__` prefix to flag the contract.
 */
export function __resetNavigationForTest(): void {
  dispose();
  pushChain = Promise.resolve();
}
