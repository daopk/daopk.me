import {
  computed,
  nextTick,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

import { hasAppSettings } from "~/core/apps/appSettings";
import { debugWarn } from "~/core/debug";
import { AppLaunchError } from "~/core/kernel/errors";
import {
  appBrowserTitle,
  appFallbackBrowserPath,
  DEFAULT_BROWSER_TITLE,
  HOME_BROWSER_PATH,
} from "~/core/routing/appBrowserPaths";
import { emitAppResume, resolveAppResume, type AppResumeSource } from "~/core/routing/appResume";
import { youtubePlayerVideoIdFromArgs } from "~/core/routing/appUrlIntents";
import {
  handleShellOpenRequest,
  type ShellOpenRequest,
  type ShellOpenRequestAdapter,
} from "~/shells/shared/shellOpenRequests";
import { useShellAppEventBridge } from "~/shells/shared/useShellAppEventBridge";
import type { AppChromeContentSize, AppHandle, AppManifest } from "~/types/app";
import type { CommandContext } from "~/types/command";
import type { Kernel } from "~/types/kernel";

import {
  TITLEBAR_HEIGHT,
  useWindowManager,
  type SnapEdge,
  type StageSize,
  type WindowRecord,
} from "./useWindowManager";

export interface DesktopWindowStageAdapter {
  readonly stageBounds: StageSize;
  centeredInitialPosition(
    source: AppResumeSource,
    size?: { width: number; height: number },
  ): { x: number; y: number } | undefined;
  maximizeStageSize(): StageSize;
  measuredStageSize(): StageSize;
  stageForSnap(edge: SnapEdge): StageSize;
}

export interface DesktopWindowSessionAdapters {
  readonly kernel: Kernel;
  readonly stage: DesktopWindowStageAdapter;
  readonly notifyLaunchFailed: (manifest: AppManifest) => void;
  readonly notifyUnavailable: (manifestId: string) => void;
}

export interface DesktopSnapPreview {
  readonly edge: SnapEdge;
  readonly stage: StageSize;
}

export interface DesktopWindowSessionState {
  readonly windows: DeepReadonly<WindowRecord[]>;
  readonly snapPreview: DesktopSnapPreview | null;
  readonly browserPath: string;
  readonly browserTitle: string;
}

export type DesktopWindowSessionIntent =
  | {
      readonly type: "launch-app";
      readonly manifestId: string;
      readonly args?: Readonly<Record<string, unknown>>;
      readonly source?: AppResumeSource;
    }
  | {
      readonly type: "spawn-window";
      readonly manifestId: string;
      readonly args?: Readonly<Record<string, unknown>>;
    }
  | { readonly type: "open-request"; readonly request: ShellOpenRequest }
  | { readonly type: "focus-window"; readonly windowId: string }
  | { readonly type: "close-window"; readonly windowId: string }
  | {
      readonly type: "move-window";
      readonly windowId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: "resize-window";
      readonly windowId: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly type: "toggle-maximize"; readonly windowId: string }
  | { readonly type: "minimize-window"; readonly windowId: string }
  | { readonly type: "snap-window"; readonly windowId: string; readonly edge: SnapEdge }
  | {
      readonly type: "preview-snap";
      readonly windowId: string;
      readonly edge: SnapEdge | null;
    }
  | {
      readonly type: "set-title";
      readonly windowId: string;
      readonly title: string;
    }
  | {
      readonly type: "report-content-size";
      readonly windowId: string;
      readonly size: AppChromeContentSize | null;
    }
  | {
      readonly type: "set-document-path";
      readonly handleId: string;
      readonly manifestId: string;
      readonly path: string | null;
    }
  | {
      readonly type: "set-browser-path";
      readonly handleId: string;
      readonly manifestId: string;
      readonly path: string | null;
    }
  | { readonly type: "remove-process"; readonly handleId: string };

export interface DesktopWindowSession {
  readonly state: ComputedRef<DesktopWindowSessionState>;
  send(intent: DesktopWindowSessionIntent): void;
}

/**
 * Owns desktop app and window lifecycle policy. The shell renders the returned
 * state and translates UI events into intents; launch ordering, resume, open
 * requests, process teardown, commands, sizing, focus, and snap policy stay
 * behind this interface.
 */
export function useDesktopWindowSession(
  adapters: DesktopWindowSessionAdapters,
): DesktopWindowSession {
  const { kernel, notifyLaunchFailed, notifyUnavailable, stage } = adapters;
  const windowManager = useWindowManager({
    killProcess: (handleId: string): void => {
      kernel.processes.kill(handleId);
    },
  });
  const activeSnap = ref<{ id: string; edge: SnapEdge } | null>(null);

  type DesktopWindowRecord = (typeof windowManager.windows)[number];

  const focusedWindow = computed<DesktopWindowRecord | undefined>(() =>
    windowManager.windows.find((record) => record.focused && !record.minimized),
  );

  function focusedWindowAppName(record: DesktopWindowRecord): string {
    const manifestName = kernel.apps.list().find((entry) => entry.id === record.manifestId)?.name;
    const recordTitle = record.title.trim();
    if (recordTitle.length > 0) {
      return recordTitle;
    }

    const fallbackName = manifestName?.trim() ?? "";
    return fallbackName.length > 0 ? fallbackName : record.manifestId;
  }

  const state = computed<DesktopWindowSessionState>(() => {
    const focused = focusedWindow.value;
    const preview = activeSnap.value;

    return {
      windows: windowManager.windows,
      snapPreview:
        preview === null
          ? null
          : {
              edge: preview.edge,
              stage: preview.edge === "max" ? stage.maximizeStageSize() : stage.stageBounds,
            },
      browserPath:
        focused === undefined
          ? HOME_BROWSER_PATH
          : (focused.browserPath ?? appFallbackBrowserPath(focused.manifestId)),
      browserTitle:
        focused === undefined
          ? DEFAULT_BROWSER_TITLE
          : appBrowserTitle(focusedWindowAppName(focused)),
    };
  });

  function defaultWindowSize(manifest: AppManifest): { width: number; height: number } | undefined {
    return manifest.defaultWindow?.width !== undefined &&
      manifest.defaultWindow.height !== undefined
      ? { width: manifest.defaultWindow.width, height: manifest.defaultWindow.height }
      : undefined;
  }

  function defaultWindowMinSize(
    manifest: AppManifest,
  ): { width?: number; height?: number } | undefined {
    const { minWidth, minHeight } = manifest.defaultWindow ?? {};
    return minWidth === undefined && minHeight === undefined
      ? undefined
      : { width: minWidth, height: minHeight };
  }

  function manifestFor(manifestId: string): AppManifest | undefined {
    return kernel.apps.list().find((manifest) => manifest.id === manifestId);
  }

  function shouldMaximizeLaunch(manifestId: string, source: AppResumeSource): boolean {
    return manifestId === "blog" && source === "deeplink";
  }

  function focusedWindowForManifest(manifestId: string): DesktopWindowRecord | undefined {
    return windowManager.windows.find(
      (record) => record.manifestId === manifestId && record.focused,
    );
  }

  function maximizeFocusedLaunchWindow(manifestId: string, source: AppResumeSource): void {
    if (!shouldMaximizeLaunch(manifestId, source)) {
      return;
    }

    const record = focusedWindowForManifest(manifestId);
    if (record !== undefined) {
      windowManager.snapTo(record.id, "max", stage.maximizeStageSize());
    }
  }

  function focusedHandleIdForManifest(manifestId: string): string | undefined {
    return focusedWindowForManifest(manifestId)?.handleId;
  }

  function manifestHasSettings(manifestId: string): boolean {
    const manifest = manifestFor(manifestId);
    return manifest !== undefined && hasAppSettings(manifest);
  }

  function refreshArgsSnapshotForResume(
    manifestId: string,
    args: Readonly<Record<string, unknown>> | undefined,
  ): void {
    if (manifestId !== "youtube-player" || args === undefined) {
      return;
    }

    const focused = focusedWindowForManifest(manifestId);
    if (focused === undefined) {
      return;
    }

    const currentVideoId = youtubePlayerVideoIdFromArgs(focused.args);
    const nextVideoId = youtubePlayerVideoIdFromArgs(args);
    if (currentVideoId !== null && currentVideoId === nextVideoId) {
      return;
    }

    windowManager.setArgs(focused.id, args);
  }

  async function replayAppResume(
    manifestId: string,
    args: Readonly<Record<string, unknown>> | undefined,
    source: AppResumeSource,
  ): Promise<boolean> {
    const emission = resolveAppResume({
      manifestId,
      ...(args === undefined ? {} : { args }),
      source,
      resolveHandleId: focusedHandleIdForManifest,
      manifestHasSettings,
    });
    if (emission === null) {
      return false;
    }

    refreshArgsSnapshotForResume(manifestId, args);
    await nextTick();
    emitAppResume(kernel.events, emission);
    return true;
  }

  async function launchApp(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
    source: AppResumeSource = "api",
  ): Promise<void> {
    const manifest = manifestFor(manifestId);

    if (manifest === undefined) {
      debugWarn("[desktop-window-session] launch requested for unknown manifest", manifestId);
      notifyUnavailable(manifestId);
      return;
    }

    if (windowManager.restoreAllForManifest(manifest.id)) {
      maximizeFocusedLaunchWindow(manifest.id, source);
      const replayed = await replayAppResume(manifest.id, args, source);
      if (!replayed && args !== undefined) {
        debugWarn("[desktop-window-session]", "restore — dropping launch args", manifest.id, args);
      }
      return;
    }

    if (windowManager.focusTopOfManifest(manifest.id)) {
      maximizeFocusedLaunchWindow(manifest.id, source);
      const replayed = await replayAppResume(manifest.id, args, source);
      if (!replayed && args !== undefined) {
        debugWarn("[desktop-window-session]", "focus — dropping launch args", manifest.id, args);
      }
      return;
    }

    let handle: AppHandle;

    try {
      handle = await kernel.apps.launch(manifest.id, args);
    } catch (error) {
      if (error instanceof AppLaunchError) {
        debugWarn("[desktop-window-session] launch failed", error.code, error.manifestId);
        notifyLaunchFailed(manifest);
        return;
      }

      throw error;
    }

    const size = defaultWindowSize(manifest);
    const initialPosition = stage.centeredInitialPosition(source, size);
    const windowId = windowManager.open({
      manifestId: manifest.id,
      handleId: handle.id,
      title: manifest.name,
      singleton: manifest.singleton === true,
      size,
      minSize: defaultWindowMinSize(manifest),
      ...(initialPosition === undefined ? {} : { initial: initialPosition }),
      ...(args === undefined ? {} : { args }),
    });

    if (shouldMaximizeLaunch(manifest.id, source)) {
      windowManager.snapTo(windowId, "max", stage.maximizeStageSize());
    }
  }

  async function openNewWindow(
    manifestId: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const manifest = manifestFor(manifestId);

    if (manifest === undefined) {
      debugWarn(
        "[desktop-window-session] document open requested but manifest is missing",
        manifestId,
      );
      return;
    }

    let handle: AppHandle;
    try {
      handle = await kernel.apps.launch(manifest.id, args);
    } catch (error) {
      if (error instanceof AppLaunchError) {
        debugWarn(
          "[desktop-window-session] document open launch failed",
          error.code,
          error.manifestId,
        );
        return;
      }
      throw error;
    }

    windowManager.open({
      manifestId: manifest.id,
      handleId: handle.id,
      title: manifest.name,
      singleton: manifest.singleton === true,
      size: defaultWindowSize(manifest),
      minSize: defaultWindowMinSize(manifest),
      args,
    });
  }

  async function spawnWindow(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const manifest = manifestFor(manifestId);

    if (manifest === undefined) {
      debugWarn("[desktop-window-session] spawn requested for unknown manifest", manifestId);
      notifyUnavailable(manifestId);
      return;
    }

    let handle: AppHandle;
    try {
      handle = await kernel.apps.launch(manifest.id, args);
    } catch (error) {
      if (error instanceof AppLaunchError) {
        debugWarn("[desktop-window-session] spawn failed", error.code, error.manifestId);
        notifyLaunchFailed(manifest);
        return;
      }
      throw error;
    }

    windowManager.open({
      manifestId: manifest.id,
      handleId: handle.id,
      title: manifest.name,
      singleton: manifest.singleton === true,
      size: defaultWindowSize(manifest),
      minSize: defaultWindowMinSize(manifest),
      ...(args === undefined ? {} : { args }),
    });
  }

  const desktopOpenRequestAdapter: ShellOpenRequestAdapter<DesktopWindowRecord> = {
    findPreferred(manifestId, predicate) {
      let topmost: DesktopWindowRecord | null = null;

      for (const record of windowManager.windows) {
        if (record.manifestId !== manifestId || !predicate(record)) {
          continue;
        }
        if (topmost === null || record.z > topmost.z) {
          topmost = record;
        }
      }

      return topmost;
    },
    async apply(action) {
      switch (action.type) {
        case "focus": {
          const wasMinimized = action.target.minimized;
          windowManager.focus(action.target.id);
          if (action.manifestId === "editor" && wasMinimized) {
            await nextTick();
            kernel.events.emit("editor.window.open.requested", {
              handleId: action.target.handleId,
              path: action.path,
            });
          }
          return;
        }
        case "reuse-editor":
          windowManager.focus(action.target.id);
          await nextTick();
          kernel.events.emit("editor.window.open.requested", {
            handleId: action.target.handleId,
            path: action.path,
          });
          return;
        case "spawn":
          await openNewWindow(action.manifestId, action.args);
          return;
      }
    },
  };

  function onSnapIntent(windowId: string, edge: SnapEdge | null): void {
    if (edge === null) {
      if (activeSnap.value?.id === windowId) {
        activeSnap.value = null;
      }
      return;
    }

    activeSnap.value = { id: windowId, edge };
  }

  function normalizedContentDimension(value: number): number | null {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }

  function applyContentSize(windowId: string, size: AppChromeContentSize | null): void {
    if (size === null) {
      return;
    }

    const record = windowManager.windows.find((entry) => entry.id === windowId);
    if (record === undefined || record.maximized || record.snap !== undefined) {
      return;
    }

    const contentWidth = normalizedContentDimension(size.width);
    const contentHeight = normalizedContentDimension(size.height);
    if (contentWidth === null || contentHeight === null) {
      return;
    }

    const measuredStage = stage.measuredStageSize();
    const requestedWidth = Math.max(contentWidth, record.minWidth);
    const requestedHeight = Math.max(contentHeight + TITLEBAR_HEIGHT, record.minHeight);
    const width =
      measuredStage.width > 0 ? Math.min(requestedWidth, measuredStage.width) : requestedWidth;
    const height =
      measuredStage.height > 0 ? Math.min(requestedHeight, measuredStage.height) : requestedHeight;
    let x = record.x;
    let y = record.y;

    if (measuredStage.width > 0) {
      x = Math.min(Math.max(x, 0), Math.max(measuredStage.width - width, 0));
    }
    if (measuredStage.height > 0) {
      y = Math.min(Math.max(y, 0), Math.max(measuredStage.height - height, 0));
    }

    windowManager.setBounds(windowId, x, y, width, height);
  }

  function send(intent: DesktopWindowSessionIntent): void {
    switch (intent.type) {
      case "launch-app":
        void launchApp(intent.manifestId, intent.args, intent.source);
        return;
      case "spawn-window":
        void spawnWindow(intent.manifestId, intent.args);
        return;
      case "open-request":
        void handleShellOpenRequest(intent.request, desktopOpenRequestAdapter);
        return;
      case "focus-window":
        windowManager.focus(intent.windowId);
        return;
      case "close-window":
        windowManager.close(intent.windowId);
        return;
      case "move-window":
        windowManager.move(intent.windowId, intent.x, intent.y);
        return;
      case "resize-window":
        windowManager.setBounds(intent.windowId, intent.x, intent.y, intent.width, intent.height);
        return;
      case "toggle-maximize":
        windowManager.toggleMaximize(intent.windowId, stage.maximizeStageSize());
        return;
      case "minimize-window":
        windowManager.minimize(intent.windowId);
        return;
      case "snap-window":
        windowManager.snapTo(intent.windowId, intent.edge, stage.stageForSnap(intent.edge));
        return;
      case "preview-snap":
        onSnapIntent(intent.windowId, intent.edge);
        return;
      case "set-title":
        windowManager.setTitle(intent.windowId, intent.title);
        return;
      case "report-content-size":
        applyContentSize(intent.windowId, intent.size);
        return;
      case "set-document-path":
        windowManager.setDocumentPath(intent.handleId, intent.manifestId, intent.path);
        return;
      case "set-browser-path":
        windowManager.setBrowserPath(intent.handleId, intent.manifestId, intent.path);
        return;
      case "remove-process":
        windowManager.removeByHandleId(intent.handleId);
        return;
    }
  }

  useShellAppEventBridge(
    {
      launch: (manifestId, args, source) => {
        send({ type: "launch-app", manifestId, args, source });
      },
      spawnNew: (manifestId, args) => {
        send({ type: "spawn-window", manifestId, args });
      },
      open: (request) => {
        send({ type: "open-request", request });
      },
      setDocumentPath: (handleId, manifestId, path) => {
        send({ type: "set-document-path", handleId, manifestId, path });
      },
      setBrowserPath: (handleId, manifestId, path) => {
        send({ type: "set-browser-path", handleId, manifestId, path });
      },
      removeByHandleId: (handleId) => {
        send({ type: "remove-process", handleId });
      },
    },
    kernel,
  );

  function windowIdFromPayload(ctx: CommandContext, commandId: string): string | null {
    const value = ctx.payload.windowId;
    if (typeof value !== "string" || value.length === 0) {
      debugWarn("[desktop-window-session]", commandId, "missing string payload", "windowId");
      return null;
    }

    if (!windowManager.windows.some((record) => record.id === value)) {
      debugWarn("[desktop-window-session]", commandId, "unknown window", value);
      return null;
    }

    return value;
  }

  const disposeWindowCommands = [
    kernel.commands.register({
      id: "desktop:window.minimize",
      title: "Minimize Window",
      scope: "shell",
      run(ctx) {
        const windowId = windowIdFromPayload(ctx, "desktop:window.minimize");
        if (windowId !== null) {
          send({ type: "minimize-window", windowId });
        }
      },
    }),
    kernel.commands.register({
      id: "desktop:window.toggleMaximize",
      title: "Maximize or Restore Window",
      scope: "shell",
      run(ctx) {
        const windowId = windowIdFromPayload(ctx, "desktop:window.toggleMaximize");
        if (windowId !== null) {
          send({ type: "toggle-maximize", windowId });
        }
      },
    }),
    kernel.commands.register({
      id: "desktop:window.close",
      title: "Close Window",
      scope: "shell",
      run(ctx) {
        const windowId = windowIdFromPayload(ctx, "desktop:window.close");
        if (windowId !== null) {
          send({ type: "close-window", windowId });
        }
      },
    }),
    kernel.commands.register({
      id: "desktop:window.openSettings",
      title: "Open App Settings",
      scope: "shell",
      run(ctx) {
        const windowId = windowIdFromPayload(ctx, "desktop:window.openSettings");
        if (windowId === null) {
          return;
        }

        const record = windowManager.windows.find((entry) => entry.id === windowId);
        if (record === undefined) {
          debugWarn(
            "[desktop-window-session]",
            "desktop:window.openSettings",
            "unknown window",
            windowId,
          );
          return;
        }

        const manifest = manifestFor(record.manifestId);
        if (manifest === undefined || !hasAppSettings(manifest)) {
          debugWarn(
            "[desktop-window-session]",
            "desktop:window.openSettings",
            "manifest has no settings",
            record.manifestId,
          );
          return;
        }

        windowManager.focus(windowId);
        kernel.events.emit("app.settings.requested", {
          manifestId: record.manifestId,
          handleId: record.handleId,
        });
      },
    }),
  ];

  watch(
    () => [stage.stageBounds.width, stage.stageBounds.height] as const,
    () => {
      windowManager.rebindToStage(stage.maximizeStageSize());
    },
  );

  onScopeDispose(() => {
    for (const dispose of disposeWindowCommands) {
      dispose();
    }
  });

  return { state, send };
}
