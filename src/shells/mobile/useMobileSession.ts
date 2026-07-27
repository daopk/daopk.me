import {
  computed,
  nextTick,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  watch,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

import { debugWarn } from "~/core/debug";
import {
  appBrowserTitle,
  appFallbackBrowserPath,
  DEFAULT_BROWSER_TITLE,
  HOME_BROWSER_PATH,
} from "~/core/routing/appBrowserPaths";
import { emitAppResume, resolveAppResume, type AppResumeSource } from "~/core/routing/appResume";
import {
  handleShellOpenRequest,
  type ShellOpenRequest,
  type ShellOpenRequestAdapter,
} from "~/shells/shared/shellOpenRequests";
import {
  setSurfaceBrowserPath,
  setSurfaceDocumentPath,
  type AppSurfaceRecord,
} from "~/shells/shared/appSurface";
import { useShellAppEventBridge } from "~/shells/shared/useShellAppEventBridge";
import type { Kernel } from "~/types/kernel";

import {
  mobileSessionOwnsHandle,
  registerMobileSessionHandleClaim,
  registerMobileSessionHandleOwner,
  waitForMobileSessionHandleClaims,
} from "./mobileSessionHandleOwnership";
import type { MobileManifest, MobileManifestProjection } from "./useMobileManifestProjection";

export interface NavigationFrame extends AppSurfaceRecord {
  readonly frameId: string;
  readonly handleId: string;
  readonly manifestId: string;
  readonly args?: Readonly<Record<string, unknown>>;
  documentPath?: string | null;
  browserPath?: string | null;
  title?: string | null;
}

export interface MobileSessionState {
  readonly frames: DeepReadonly<NavigationFrame[]>;
  readonly foregroundFrameId: string | null;
  readonly homeVisible: boolean;
  readonly recentsAvailable: boolean;
  readonly recentsVisible: boolean;
  readonly launchingManifestIds: ReadonlySet<string>;
  readonly browserPath: string;
  readonly browserTitle: string;
}

export type MobileSessionIntent =
  | {
      readonly type: "launch-app";
      readonly manifestId: string;
      readonly args?: Readonly<Record<string, unknown>>;
      readonly source?: AppResumeSource;
    }
  | { readonly type: "go-home" }
  | { readonly type: "open-recents" }
  | { readonly type: "close-recents" }
  | { readonly type: "select-recent"; readonly frameId: string }
  | { readonly type: "dismiss"; readonly frameId: string }
  | { readonly type: "dismiss-all" }
  | {
      readonly type: "set-title";
      readonly handleId: string;
      readonly manifestId: string;
      readonly title: string | null;
    };

export interface MobileSession {
  readonly state: ComputedRef<MobileSessionState>;
  send(intent: MobileSessionIntent): void;
}

export interface MobileSessionAdapters {
  readonly kernel: Kernel;
  readonly manifests: MobileManifestProjection;
  readonly notifyUnsupported: (manifest: MobileManifest) => void;
  readonly restoreHomeFocus: (manifestId: string) => void;
}

/**
 * Owns the policy for a mobile app session. The shell renders the returned
 * state and translates UI events into intents; launch ordering, resume,
 * recents, process navigation, open requests, and focus restoration stay here.
 */
export function useMobileSession(adapters: MobileSessionAdapters): MobileSession {
  const { kernel, manifests, notifyUnsupported, restoreHomeFocus } = adapters;

  const frames = reactive<NavigationFrame[]>([]);
  const publishedFrames = readonly(frames) as DeepReadonly<NavigationFrame[]>;
  const unregisterHandleOwner = registerMobileSessionHandleOwner(kernel, (handleId) =>
    frames.some((frame) => frame.handleId === handleId),
  );
  const foregroundFrameId = ref<string | null>(null);
  const recentsRequested = ref(false);
  const lastLaunchedManifestId = ref<string | null>(null);
  const launchingManifestIds = ref<ReadonlySet<string>>(new Set<string>());
  const releasePendingHandleClaims = new Set<() => void>();
  let launchChain: Promise<unknown> = Promise.resolve();
  let disposed = false;

  function beginHandleClaim(manifestId: string): () => void {
    const unregister = registerMobileSessionHandleClaim(kernel, manifestId);
    let pending = true;
    const release = (): void => {
      if (!pending) {
        return;
      }
      pending = false;
      releasePendingHandleClaims.delete(release);
      unregister();
    };
    releasePendingHandleClaims.add(release);
    return release;
  }

  function killHandleIfUnowned(
    handleId: string,
    reason: "user" | "shell",
    operation: string,
  ): void {
    if (mobileSessionOwnsHandle(kernel, handleId)) {
      return;
    }
    try {
      kernel.processes.kill(handleId, reason);
    } catch (error) {
      debugWarn("[mobile-session]", `${operation}: kill threw`, error);
    }
  }

  function createFrameId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `frame-${frames.length}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function doSpawn(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<NavigationFrame> {
    if (disposed) {
      throw new Error(`Mobile session disposed before launching "${manifestId}"`);
    }

    const handle = await kernel.apps.launch(manifestId, args);

    if (disposed) {
      // A replacement may have synchronously claimed this singleton launch but
      // not published its frame yet. Let every live claim settle before reaping.
      if (manifests.find(manifestId)?.singleton === true) {
        await waitForMobileSessionHandleClaims(kernel, manifestId);
      }
      killHandleIfUnowned(handle.id, "shell", "late launch teardown");
      throw new Error(`Mobile session disposed while launching "${manifestId}"`);
    }

    const existingByHandle = frames.find((frame) => frame.handleId === handle.id);
    if (existingByHandle !== undefined) {
      if (args !== undefined) {
        debugWarn("[mobile-session]", "existingByHandle — dropping spawn args", manifestId, args);
      }
      foregroundFrameId.value = existingByHandle.frameId;
      return existingByHandle;
    }

    const newFrame: NavigationFrame = {
      frameId: createFrameId(),
      handleId: handle.id,
      manifestId,
      ...(args === undefined ? {} : { args: Object.freeze({ ...args }) }),
    };
    frames.push(newFrame);
    foregroundFrameId.value = newFrame.frameId;
    return newFrame;
  }

  async function launchFrame(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<NavigationFrame> {
    const releaseHandleClaim = beginHandleClaim(manifestId);
    const previous = launchChain.catch(() => undefined);
    const next = previous.then(async (): Promise<NavigationFrame> => {
      const existingByManifest = frames.find((frame) => frame.manifestId === manifestId);
      if (existingByManifest !== undefined) {
        if (args !== undefined) {
          debugWarn("[mobile-session]", "resume — dropping launch args", manifestId, args);
        }
        foregroundFrameId.value = existingByManifest.frameId;
        return existingByManifest;
      }

      return doSpawn(manifestId, args);
    });

    const tracked = next.finally(releaseHandleClaim);
    launchChain = tracked.catch(() => undefined);
    return tracked;
  }

  async function spawnFrame(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<NavigationFrame> {
    const releaseHandleClaim = beginHandleClaim(manifestId);
    const previous = launchChain.catch(() => undefined);
    const next = previous.then(() => doSpawn(manifestId, args));
    const tracked = next.finally(releaseHandleClaim);
    launchChain = tracked.catch(() => undefined);
    return tracked;
  }

  function goHome(): void {
    foregroundFrameId.value = null;
  }

  function focusFrame(frameId: string): void {
    if (foregroundFrameId.value === frameId || !frames.some((frame) => frame.frameId === frameId)) {
      return;
    }
    foregroundFrameId.value = frameId;
  }

  function dismiss(frameId: string): void {
    const index = frames.findIndex((frame) => frame.frameId === frameId);
    if (index === -1) {
      return;
    }

    const [removed] = frames.splice(index, 1);
    if (foregroundFrameId.value === frameId) {
      foregroundFrameId.value = frames.at(-1)?.frameId ?? null;
    }

    killHandleIfUnowned(removed.handleId, "user", "dismiss");
  }

  function dismissAll(): void {
    if (frames.length === 0) {
      return;
    }

    const removed = frames.splice(0, frames.length);
    foregroundFrameId.value = null;

    const killedHandles = new Set<string>();
    for (const frame of removed) {
      if (killedHandles.has(frame.handleId)) {
        continue;
      }
      killedHandles.add(frame.handleId);

      killHandleIfUnowned(frame.handleId, "user", "dismissAll");
    }
  }

  function removeByHandleId(handleId: string): boolean {
    let removedForeground = false;
    let removed = false;
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      const frame = frames[index];
      if (frame?.handleId !== handleId) {
        continue;
      }

      removed = true;
      removedForeground ||= foregroundFrameId.value === frame.frameId;
      frames.splice(index, 1);
    }

    if (removedForeground) {
      foregroundFrameId.value = frames.at(-1)?.frameId ?? null;
    }
    return removed;
  }

  function setTitle(handleId: string, manifestId: string, title: string | null): boolean {
    const frame = frames.find(
      (entry) => entry.handleId === handleId && entry.manifestId === manifestId,
    );
    if (frame === undefined) {
      return false;
    }
    frame.title = title;
    return true;
  }

  const currentFrame = computed<NavigationFrame | null>(() => {
    if (foregroundFrameId.value === null) {
      return null;
    }
    return frames.find((frame) => frame.frameId === foregroundFrameId.value) ?? null;
  });

  const state = computed<MobileSessionState>(() => {
    const frame = currentFrame.value;
    const frameCount = frames.length;

    return {
      frames: publishedFrames,
      foregroundFrameId: foregroundFrameId.value,
      homeVisible: foregroundFrameId.value === null,
      recentsAvailable: foregroundFrameId.value === null && frameCount > 0,
      recentsVisible: recentsRequested.value && frameCount > 0,
      launchingManifestIds: launchingManifestIds.value,
      browserPath:
        frame === null
          ? HOME_BROWSER_PATH
          : (frame.browserPath ?? appFallbackBrowserPath(frame.manifestId)),
      browserTitle:
        frame === null
          ? DEFAULT_BROWSER_TITLE
          : appBrowserTitle(
              frame.title ?? manifests.find(frame.manifestId)?.name ?? frame.manifestId,
            ),
    };
  });

  function addLaunching(manifestId: string): void {
    const next = new Set(launchingManifestIds.value);
    next.add(manifestId);
    launchingManifestIds.value = next;
  }

  function clearLaunching(manifestId: string): void {
    if (!launchingManifestIds.value.has(manifestId)) {
      return;
    }
    const next = new Set(launchingManifestIds.value);
    next.delete(manifestId);
    launchingManifestIds.value = next;
  }

  function commitLaunched(manifestId: string): void {
    lastLaunchedManifestId.value = manifestId;
  }

  function manifestHasSettings(manifestId: string): boolean {
    return manifests.find(manifestId)?.hasSettings ?? false;
  }

  function unsupportedManifestFor(manifestId: string): MobileManifest | null {
    const manifest = manifests.find(manifestId);
    if (!manifest || manifest.supported) {
      return null;
    }
    return manifest;
  }

  function launch(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
    source: AppResumeSource = "api",
  ): void {
    const unsupported = unsupportedManifestFor(manifestId);

    if (unsupported) {
      recentsRequested.value = false;
      clearLaunching(manifestId);
      notifyUnsupported(unsupported);
      return;
    }

    const willResume = frames.some((frame) => frame.manifestId === manifestId);
    if (!willResume) {
      addLaunching(manifestId);
    }

    void launchFrame(manifestId, args).then(
      () => {
        if (!willResume) {
          clearLaunching(manifestId);
        }
        if (willResume) {
          const emission = resolveAppResume({
            manifestId,
            ...(args === undefined ? {} : { args }),
            source,
            resolveHandleId: (id) => frames.find((entry) => entry.manifestId === id)?.handleId,
            manifestHasSettings,
          });
          if (emission !== null) {
            emitAppResume(kernel.events, emission);
          }
        }
        commitLaunched(manifestId);
      },
      () => {
        clearLaunching(manifestId);
      },
    );
  }

  function spawnNew(manifestId: string, args?: Readonly<Record<string, unknown>>): Promise<void> {
    const unsupported = unsupportedManifestFor(manifestId);

    if (unsupported) {
      recentsRequested.value = false;
      clearLaunching(manifestId);
      notifyUnsupported(unsupported);
      return Promise.resolve();
    }

    addLaunching(manifestId);
    return spawnFrame(manifestId, args).then(
      () => {
        clearLaunching(manifestId);
        commitLaunched(manifestId);
      },
      () => {
        clearLaunching(manifestId);
      },
    );
  }

  const mobileOpenRequestAdapter: ShellOpenRequestAdapter<DeepReadonly<NavigationFrame>> = {
    findPreferred(manifestId, predicate) {
      const candidates = publishedFrames.filter(
        (frame) => frame.manifestId === manifestId && predicate(frame),
      );
      if (candidates.length === 0) {
        return null;
      }

      return (
        candidates.find((frame) => frame.frameId === foregroundFrameId.value) ?? candidates.at(-1)!
      );
    },
    async apply(action) {
      switch (action.type) {
        case "focus":
          focusFrame(action.target.frameId);
          return;
        case "reuse-editor":
          focusFrame(action.target.frameId);
          await nextTick();
          kernel.events.emit("editor.window.open.requested", {
            handleId: action.target.handleId,
            path: action.path,
          });
          commitLaunched("editor");
          return;
        case "spawn":
          await spawnNew(action.manifestId, action.args);
          return;
      }
    },
  };

  async function open(request: ShellOpenRequest): Promise<void> {
    const unsupported = unsupportedManifestFor(request.manifestId);
    if (unsupported) {
      recentsRequested.value = false;
      clearLaunching(request.manifestId);
      notifyUnsupported(unsupported);
      return;
    }

    await handleShellOpenRequest(request, mobileOpenRequestAdapter);
  }

  function closeRecentsWhenEmpty(): void {
    if (frames.length === 0) {
      recentsRequested.value = false;
    }
  }

  function send(intent: MobileSessionIntent): void {
    switch (intent.type) {
      case "launch-app":
        launch(intent.manifestId, intent.args, intent.source);
        return;
      case "go-home":
        goHome();
        return;
      case "open-recents":
        if (frames.length > 0) {
          recentsRequested.value = true;
        }
        return;
      case "close-recents":
        recentsRequested.value = false;
        return;
      case "select-recent":
        focusFrame(intent.frameId);
        recentsRequested.value = false;
        return;
      case "dismiss":
        dismiss(intent.frameId);
        closeRecentsWhenEmpty();
        return;
      case "dismiss-all":
        dismissAll();
        recentsRequested.value = false;
        return;
      case "set-title":
        setTitle(intent.handleId, intent.manifestId, intent.title);
        return;
    }
  }

  useShellAppEventBridge(
    {
      launch,
      spawnNew: (manifestId, args) => {
        void spawnNew(manifestId, args);
      },
      open: (request) => {
        void open(request);
      },
      setDocumentPath: (handleId, manifestId, path) => {
        setSurfaceDocumentPath(frames, handleId, manifestId, path);
      },
      setBrowserPath: (handleId, manifestId, path) => {
        setSurfaceBrowserPath(frames, handleId, manifestId, path);
      },
      removeByHandleId: (handleId) => {
        removeByHandleId(handleId);
        closeRecentsWhenEmpty();
      },
    },
    kernel,
  );

  watch(foregroundFrameId, async (next, previous) => {
    if (previous === null || next !== null || lastLaunchedManifestId.value === null) {
      return;
    }
    await nextTick();
    restoreHomeFocus(lastLaunchedManifestId.value);
  });

  const stopProcessSync = watch(foregroundFrameId, (next, previous) => {
    if (next === previous) {
      return;
    }

    const previousHandle =
      previous === null
        ? null
        : (frames.find((frame) => frame.frameId === previous)?.handleId ?? null);
    const nextHandle =
      next === null ? null : (frames.find((frame) => frame.frameId === next)?.handleId ?? null);

    if (previousHandle !== null && previousHandle !== nextHandle) {
      kernel.processes.suspend(previousHandle);
    }
    if (nextHandle !== null && nextHandle !== previousHandle) {
      kernel.processes.resume(nextHandle);
    }
  });

  onScopeDispose(() => {
    disposed = true;
    stopProcessSync();
    for (const release of releasePendingHandleClaims) {
      release();
    }

    while (frames.length > 0) {
      const frame = frames.pop();
      if (frame === undefined) {
        continue;
      }
      killHandleIfUnowned(frame.handleId, "shell", "dispose");
    }
    unregisterHandleOwner();
    foregroundFrameId.value = null;
  });

  return { state, send };
}
