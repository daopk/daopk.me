<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from "vue";
import { useElementBounding, useResizeObserver } from "@vueuse/core";

import { useKernel } from "~/composables/useKernel";
import { hasAppSettings } from "~/core/apps/appSettings";
import { debugWarn } from "~/core/debug";
import { AppLaunchError } from "~/core/kernel/errors";
import { isBlogPostSlug } from "~/core/routing/blogPaths";
import { emitAppResume, resolveAppResume } from "~/core/routing/appResume";
import {
  appBrowserTitle,
  appFallbackBrowserPath,
  DEFAULT_BROWSER_TITLE,
  HOME_BROWSER_PATH,
} from "~/core/routing/appBrowserPaths";
import { youtubePlayerVideoIdFromArgs } from "~/core/routing/appUrlIntents";
import {
  documentPathFor,
  normalizeDocumentOpenPath,
} from "~/shells/shared/documentOpenRouting";
import { useShellAppEventBridge } from "~/shells/shared/useShellAppEventBridge";
import { useShellBrowserChromeSync } from "~/shells/shared/useShellBrowserChromeSync";
import type { AppChromeContentSize, AppHandle, AppManifest } from "~/types/app";
import type { CommandContext } from "~/types/command";

import SnapPreview from "./SnapPreview.vue";
import Window from "./Window.vue";
import {
  DEFAULT_H,
  DEFAULT_W,
  MIN_H,
  MIN_W,
  TITLEBAR_HEIGHT,
  useWindowManager,
  type SnapEdge,
  type StageSize,
} from "./useWindowManager";

type AppLaunchSource = KernelEventPayloads["app.launch.requested"]["source"];

const kernel = useKernel();
const windowManager = useWindowManager({
  killProcess: (handleId: string): void => {
    kernel.processes.kill(handleId);
  },
});

const hostRef = useTemplateRef<HTMLElement>("hostRef");
const stageBounds = reactive({ width: 0, height: 0 });

useResizeObserver(hostRef, (entries) => {
  const entry = entries[0];

  if (!entry) {
    return;
  }

  stageBounds.width = entry.contentRect.width;
  stageBounds.height = entry.contentRect.height;
});

// Stage offset is reactive on purpose — a future theme toggle / chrome change
// (`ResizeObserver` + scroll), which never fire during a normal pointermove.
const hostBounds = useElementBounding(hostRef);
const stageOffset = computed(() => ({
  x: hostBounds.left.value,
  y: hostBounds.top.value,
}));

function defaultWindowSize(manifest: AppManifest): { width: number; height: number } | undefined {
  return manifest.defaultWindow?.width !== undefined && manifest.defaultWindow.height !== undefined
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

const activeSnap = ref<{ id: string; edge: SnapEdge } | null>(null);

function onSnapIntent(id: string, edge: SnapEdge | null): void {
  if (edge === null) {
    if (activeSnap.value?.id === id) {
      activeSnap.value = null;
    }

    return;
  }

  activeSnap.value = { id, edge };
}

function measuredStageSize(): StageSize {
  if (stageBounds.width > 0 && stageBounds.height > 0) {
    return { width: stageBounds.width, height: stageBounds.height };
  }

  const rect = hostRef.value?.getBoundingClientRect();
  return {
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
  };
}

function dockIsVisible(zone: HTMLElement): boolean {
  return (
    !zone.classList.contains("dock-reveal-zone--auto-hide") ||
    zone.classList.contains("dock-reveal-zone--revealed")
  );
}

function maximizeStageSize(): StageSize {
  const stage = measuredStageSize();
  const host = hostRef.value;

  if (host === null || stage.width <= 0 || stage.height <= 0) {
    return stage;
  }

  const dockZone = document.querySelector<HTMLElement>(".dock-reveal-zone");
  if (dockZone === null || !dockIsVisible(dockZone)) {
    return stage;
  }

  const dock = dockZone.querySelector<HTMLElement>(".dock");
  if (dock === null) {
    return stage;
  }

  const hostRect = host.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();
  const dockTop = dockRect.top - hostRect.top;

  if (dockRect.height <= 0 || dockTop <= 0 || dockTop >= stage.height) {
    return stage;
  }

  return {
    width: stage.width,
    height: dockTop,
  };
}

function stageForSnap(edge: SnapEdge): StageSize {
  return edge === "max" ? maximizeStageSize() : stageBounds;
}

const snapPreviewStage = computed(() =>
  activeSnap.value?.edge === "max" ? maximizeStageSize() : stageBounds,
);

function centeredInitialPosition(
  source: AppLaunchSource,
  size?: { width: number; height: number },
): { x: number; y: number } | undefined {
  if (source !== "deeplink") {
    return undefined;
  }

  const stage = measuredStageSize();
  if (stage.width <= 0 || stage.height <= 0) {
    return undefined;
  }

  const width = Math.max(size?.width ?? DEFAULT_W, MIN_W);
  const height = Math.max(size?.height ?? DEFAULT_H, MIN_H);

  return {
    x: Math.max(0, Math.floor((stage.width - width) / 2)),
    y: Math.max(0, Math.floor((stage.height - height) / 2)),
  };
}

watch(
  () => [stageBounds.width, stageBounds.height] as const,
  () => {
    windowManager.rebindToStage(maximizeStageSize());
  },
);

useShellAppEventBridge({
  launch: (manifestId, args, source) => {
    void onLaunchRequested(manifestId, args, source);
  },
  spawnNew: (manifestId, args) => {
    void onSpawnNewRequested(manifestId, args);
  },
  openEditor: (path) => {
    void onEditorOpenRequested(path);
  },
  openBlogPost: (path, slug) => {
    void onBlogPostOpenRequested(path, slug);
  },
  openPdfViewer: (path) => {
    void onPdfViewerOpenRequested(path);
  },
  setDocumentPath: (handleId, manifestId, path) => {
    windowManager.setDocumentPath(handleId, manifestId, path);
  },
  setBrowserPath: (handleId, manifestId, path) => {
    windowManager.setBrowserPath(handleId, manifestId, path);
  },
  removeByHandleId: (handleId) => {
    windowManager.removeByHandleId(handleId);
  },
});

type DesktopWindowRecord = (typeof windowManager.windows)[number];

const focusedBrowserPath = computed(() => {
  const focusedWindow = windowManager.windows.find((record) => record.focused && !record.minimized);
  if (focusedWindow === undefined) {
    return HOME_BROWSER_PATH;
  }

  return focusedWindow.browserPath ?? appFallbackBrowserPath(focusedWindow.manifestId);
});

function focusedWindowAppName(record: DesktopWindowRecord): string {
  const manifestName = kernel.apps.list().find((entry) => entry.id === record.manifestId)?.name;
  const recordTitle = record.title.trim();
  if (recordTitle.length > 0) {
    return recordTitle;
  }

  const fallbackName = manifestName?.trim() ?? "";
  return fallbackName.length > 0 ? fallbackName : record.manifestId;
}

const focusedBrowserTitle = computed(() => {
  const focusedWindow = windowManager.windows.find((record) => record.focused && !record.minimized);
  if (focusedWindow === undefined) {
    return DEFAULT_BROWSER_TITLE;
  }

  return appBrowserTitle(focusedWindowAppName(focusedWindow));
});

useShellBrowserChromeSync(focusedBrowserPath, focusedBrowserTitle);

function shouldMaximizeLaunch(manifestId: string, source: AppLaunchSource): boolean {
  return manifestId === "blog" && source === "deeplink";
}

function focusedWindowForManifest(manifestId: string): DesktopWindowRecord | undefined {
  return windowManager.windows.find((record) => record.manifestId === manifestId && record.focused);
}

function maximizeFocusedLaunchWindow(manifestId: string, source: AppLaunchSource): void {
  if (!shouldMaximizeLaunch(manifestId, source)) {
    return;
  }

  const record = focusedWindowForManifest(manifestId);
  if (record === undefined) {
    return;
  }

  windowManager.snapTo(record.id, "max", maximizeStageSize());
}

function windowIdFromPayload(ctx: CommandContext, commandId: string): string | null {
  const value = ctx.payload.windowId;
  if (typeof value !== "string" || value.length === 0) {
    debugWarn("[window-host]", commandId, "missing string payload", "windowId");
    return null;
  }

  if (!windowManager.windows.some((record) => record.id === value)) {
    debugWarn("[window-host]", commandId, "unknown window", value);
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
      const id = windowIdFromPayload(ctx, "desktop:window.minimize");
      if (id === null) return;
      windowManager.minimize(id);
    },
  }),
  kernel.commands.register({
    id: "desktop:window.toggleMaximize",
    title: "Maximize or Restore Window",
    scope: "shell",
    run(ctx) {
      const id = windowIdFromPayload(ctx, "desktop:window.toggleMaximize");
      if (id === null) return;
      windowManager.toggleMaximize(id, maximizeStageSize());
    },
  }),
  kernel.commands.register({
    id: "desktop:window.close",
    title: "Close Window",
    scope: "shell",
    run(ctx) {
      const id = windowIdFromPayload(ctx, "desktop:window.close");
      if (id === null) return;
      windowManager.close(id);
    },
  }),
  kernel.commands.register({
    id: "desktop:window.openSettings",
    title: "Open App Settings",
    scope: "shell",
    run(ctx) {
      const id = windowIdFromPayload(ctx, "desktop:window.openSettings");
      if (id === null) return;

      const record = windowManager.windows.find((entry) => entry.id === id);
      if (record === undefined) {
        debugWarn("[window-host]", "desktop:window.openSettings", "unknown window", id);
        return;
      }

      const manifest = kernel.apps.list().find((entry) => entry.id === record.manifestId);
      if (manifest === undefined || !hasAppSettings(manifest)) {
        debugWarn(
          "[window-host]",
          "desktop:window.openSettings",
          "manifest has no settings",
          record.manifestId,
        );
        return;
      }

      windowManager.focus(id);
      kernel.events.emit("app.settings.requested", {
        manifestId: record.manifestId,
        handleId: record.handleId,
      });
    },
  }),
];

function focusedHandleIdForManifest(manifestId: string): string | undefined {
  return focusedWindowForManifest(manifestId)?.handleId;
}

function manifestHasSettings(manifestId: string): boolean {
  const manifest = kernel.apps.list().find((entry) => entry.id === manifestId);
  return manifest !== undefined && hasAppSettings(manifest);
}

function refreshArgsSnapshotForResume(
  manifestId: string,
  args: Readonly<Record<string, unknown>> | undefined,
): void {
  if (manifestId !== "youtube-player" || args === undefined) {
    return;
  }

  const focusedWindow = windowManager.windows.find(
    (record) => record.manifestId === manifestId && record.focused,
  );
  if (focusedWindow === undefined) {
    return;
  }

  const currentVideoId = youtubePlayerVideoIdFromArgs(focusedWindow.args);
  const nextVideoId = youtubePlayerVideoIdFromArgs(args);
  if (currentVideoId !== null && currentVideoId === nextVideoId) {
    return;
  }

  windowManager.setArgs(focusedWindow.id, args);
}

async function replayAppResume(
  manifestId: string,
  args: Readonly<Record<string, unknown>> | undefined,
  source: AppLaunchSource,
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

async function onLaunchRequested(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
  source: AppLaunchSource = "api",
): Promise<void> {
  const manifest = kernel.apps.list().find((m) => m.id === manifestId);

  if (!manifest) {
    debugWarn("[window-host] launch requested for unknown manifest", manifestId);

    return;
  }

  // is intentionally NOT rewritten — that would violate AppContext.args
  if (windowManager.restoreAllForManifest(manifest.id)) {
    maximizeFocusedLaunchWindow(manifest.id, source);
    const replayed = await replayAppResume(manifest.id, args, source);
    if (!replayed && args !== undefined) {
      debugWarn("[window-host]", "restore — dropping launch args", manifest.id, args);
    }
    return;
  }

  if (windowManager.focusTopOfManifest(manifest.id)) {
    maximizeFocusedLaunchWindow(manifest.id, source);
    const replayed = await replayAppResume(manifest.id, args, source);
    if (!replayed && args !== undefined) {
      debugWarn("[window-host]", "focus — dropping launch args", manifest.id, args);
    }
    return;
  }

  let handle: AppHandle;

  try {
    handle = await kernel.apps.launch(manifest.id, args);
  } catch (error) {
    if (error instanceof AppLaunchError) {
      debugWarn("[window-host] launch failed", error.code, error.manifestId);

      return;
    }

    throw error;
  }

  const defaultSize = defaultWindowSize(manifest);
  const minSize = defaultWindowMinSize(manifest);
  const initialPosition = centeredInitialPosition(source, defaultSize);

  const windowId = windowManager.open({
    manifestId: manifest.id,
    handleId: handle.id,
    title: manifest.name,
    singleton: manifest.singleton === true,
    size: defaultSize,
    minSize,
    ...(initialPosition === undefined ? {} : { initial: initialPosition }),
    ...(args === undefined ? {} : { args }),
  });

  if (shouldMaximizeLaunch(manifest.id, source)) {
    windowManager.snapTo(windowId, "max", maximizeStageSize());
  }
}

async function onEditorOpenRequested(path: string): Promise<void> {
  const normalizedPath = normalizeEditorOpenPath(path);
  if (normalizedPath === null) {
    return;
  }

  const matchingRecord = topmostEditorWindow(
    (record) => documentPathFor(record) === normalizedPath,
  );
  if (matchingRecord !== null) {
    const wasMinimized = matchingRecord.minimized;
    windowManager.focus(matchingRecord.id);
    if (wasMinimized) {
      await nextTick();
      kernel.events.emit("editor.window.open.requested", {
        handleId: matchingRecord.handleId,
        path: normalizedPath,
      });
    }
    return;
  }

  const emptyRecord = topmostEditorWindow((record) => record.documentPath === null);
  if (emptyRecord !== null) {
    windowManager.focus(emptyRecord.id);
    await nextTick();
    kernel.events.emit("editor.window.open.requested", {
      handleId: emptyRecord.handleId,
      path: normalizedPath,
    });
    return;
  }

  await openNewEditorWindow(normalizedPath);
}

async function onBlogPostOpenRequested(path: string, slug: string): Promise<void> {
  const normalizedPath = normalizeOpenRequestPath("blog.post.open.requested", path);
  if (normalizedPath === null || !isBlogPostSlug(slug)) {
    if (!isBlogPostSlug(slug)) {
      debugWarn("[window-host]", "blog.post.open.requested invalid slug", slug);
    }
    return;
  }

  const matchingRecord = topmostWindowForManifest(
    "blog",
    (record) => documentPathFor(record) === normalizedPath,
  );
  if (matchingRecord !== null) {
    windowManager.focus(matchingRecord.id);
    return;
  }

  await openNewWindow("blog", { path: normalizedPath, slug });
}

async function onPdfViewerOpenRequested(path: string): Promise<void> {
  const normalizedPath = normalizeOpenRequestPath("pdf-viewer.open.requested", path);
  if (normalizedPath === null) {
    return;
  }

  const matchingRecord = topmostWindowForManifest(
    "pdf-viewer",
    (record) => documentPathFor(record) === normalizedPath,
  );
  if (matchingRecord !== null) {
    windowManager.focus(matchingRecord.id);
    return;
  }

  await openNewWindow("pdf-viewer", { path: normalizedPath });
}

function normalizeEditorOpenPath(path: string): string | null {
  return normalizeOpenRequestPath("editor.open.requested", path);
}

function normalizeOpenRequestPath(eventName: string, path: string): string | null {
  return normalizeDocumentOpenPath("[window-host]", eventName, path);
}

function topmostEditorWindow(
  predicate: (record: DesktopWindowRecord) => boolean,
): DesktopWindowRecord | null {
  return topmostWindowForManifest("editor", predicate);
}

function topmostWindowForManifest(
  manifestId: string,
  predicate: (record: DesktopWindowRecord) => boolean,
): DesktopWindowRecord | null {
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
}

async function openNewEditorWindow(path: string): Promise<void> {
  await openNewWindow("editor", { path });
}

async function openNewWindow(
  manifestId: string,
  args: Readonly<Record<string, unknown>>,
): Promise<void> {
  const manifest = kernel.apps.list().find((m) => m.id === manifestId);

  if (!manifest) {
    debugWarn("[window-host] document open requested but manifest is missing", manifestId);
    return;
  }

  let handle: AppHandle;
  try {
    handle = await kernel.apps.launch(manifest.id, args);
  } catch (error) {
    if (error instanceof AppLaunchError) {
      debugWarn("[window-host] document open launch failed", error.code, error.manifestId);
      return;
    }
    throw error;
  }

  const defaultSize = defaultWindowSize(manifest);
  const minSize = defaultWindowMinSize(manifest);

  windowManager.open({
    manifestId: manifest.id,
    handleId: handle.id,
    title: manifest.name,
    singleton: manifest.singleton === true,
    size: defaultSize,
    minSize,
    args,
  });
}

function onResize(id: string, x: number, y: number, width: number, height: number): void {
  windowManager.setBounds(id, x, y, width, height);
}

function normalizedContentDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function onContentSize(id: string, size: AppChromeContentSize | null): void {
  if (size === null) {
    return;
  }

  const record = windowManager.windows.find((entry) => entry.id === id);
  if (record === undefined || record.maximized || record.snap !== undefined) {
    return;
  }

  const contentWidth = normalizedContentDimension(size.width);
  const contentHeight = normalizedContentDimension(size.height);
  if (contentWidth === null || contentHeight === null) {
    return;
  }

  const stage = measuredStageSize();
  const requestedWidth = Math.max(contentWidth, record.minWidth);
  const requestedHeight = Math.max(contentHeight + TITLEBAR_HEIGHT, record.minHeight);
  const width = stage.width > 0 ? Math.min(requestedWidth, stage.width) : requestedWidth;
  const height = stage.height > 0 ? Math.min(requestedHeight, stage.height) : requestedHeight;
  let x = record.x;
  let y = record.y;

  if (stage.width > 0) {
    x = Math.min(Math.max(x, 0), Math.max(stage.width - width, 0));
  }
  if (stage.height > 0) {
    y = Math.min(Math.max(y, 0), Math.max(stage.height - height, 0));
  }

  windowManager.setBounds(id, x, y, width, height);
}

function onMaximize(id: string): void {
  windowManager.toggleMaximize(id, maximizeStageSize());
}

function onSnap(id: string, edge: SnapEdge): void {
  windowManager.snapTo(id, edge, stageForSnap(edge));
}

function onMinimize(id: string): void {
  windowManager.minimize(id);
}

async function onSpawnNewRequested(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
): Promise<void> {
  const manifest = kernel.apps.list().find((m) => m.id === manifestId);

  if (!manifest) {
    debugWarn("[window-host] spawn.new requested for unknown manifest", manifestId);
    return;
  }

  let handle: AppHandle;
  try {
    handle = await kernel.apps.launch(manifest.id, args);
  } catch (error) {
    if (error instanceof AppLaunchError) {
      debugWarn("[window-host] spawn.new failed", error.code, error.manifestId);
      return;
    }
    throw error;
  }

  const defaultSize = defaultWindowSize(manifest);
  const minSize = defaultWindowMinSize(manifest);

  windowManager.open({
    manifestId: manifest.id,
    handleId: handle.id,
    title: manifest.name,
    singleton: manifest.singleton === true,
    size: defaultSize,
    minSize,
    ...(args === undefined ? {} : { args }),
  });
}

onBeforeUnmount(() => {
  for (const dispose of disposeWindowCommands) {
    dispose();
  }
});
</script>

<template>
  <div ref="hostRef" class="window-host">
    <Transition name="snap-preview">
      <SnapPreview v-if="activeSnap" :edge="activeSnap.edge" :stage="snapPreviewStage" />
    </Transition>
    <template v-for="record in windowManager.windows" :key="record.id">
      <Window
        v-if="!record.minimized"
        :record="record"
        :stage-bounds="stageBounds"
        :stage-offset="stageOffset"
        @focus:window="windowManager.focus"
        @close:window="windowManager.close"
        @move:window="windowManager.move"
        @resize:window="onResize"
        @maximize:window="onMaximize"
        @minimize:window="onMinimize"
        @snap:window="onSnap"
        @snap-intent:window="onSnapIntent"
        @title:window="windowManager.setTitle"
        @content-size:window="onContentSize"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.window-host {
  block-size: 100%;
  inline-size: 100%;
  pointer-events: none;
  position: relative;
}

.window-host :deep(.window) {
  pointer-events: auto;
}

.window-host :deep(.snap-preview-enter-from),
.window-host :deep(.snap-preview-leave-to) {
  opacity: 0;
}

.window-host :deep(.snap-preview-enter-active),
.window-host :deep(.snap-preview-leave-active) {
  transition: opacity var(--window-snap-preview-duration) var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .window-host :deep(.snap-preview-enter-active),
  .window-host :deep(.snap-preview-leave-active) {
    transition: none;
  }
}
</style>
