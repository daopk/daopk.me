<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from "vue";
import { useElementBounding, useResizeObserver } from "@vueuse/core";

import { useKernel } from "~/composables/useKernel";
import { hasAppSettings } from "~/core/apps/appSettings";
import { debugWarn } from "~/core/debug";
import { AppLaunchError } from "~/core/kernel/errors";
import { isBlogPostSlug } from "~/core/routing/blogPaths";
import { emitAppResume, resolveAppResume } from "~/core/routing/appResume";
import { normalizeVfsPath } from "~/core/vfs/path";
import type { AppHandle } from "~/types/app";
import type { CommandContext } from "~/types/command";

import SnapPreview from "./SnapPreview.vue";
import Window from "./Window.vue";
import {
  DEFAULT_H,
  DEFAULT_W,
  MIN_H,
  MIN_W,
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

const disposeLaunchListener = kernel.events.on("app.launch.requested", (payload) => {
  void onLaunchRequested(payload.manifestId, payload.args, payload.source);
});

const disposeSpawnNewListener = kernel.events.on("app.spawn.new", (payload) => {
  void onSpawnNewRequested(payload.manifestId, payload.args);
});

const disposeEditorOpenListener = kernel.events.on("editor.open.requested", (payload) => {
  void onEditorOpenRequested(payload.path);
});

const disposeBlogPostOpenListener = kernel.events.on("blog.post.open.requested", (payload) => {
  void onBlogPostOpenRequested(payload.path, payload.slug);
});

const disposePdfViewerOpenListener = kernel.events.on("pdf-viewer.open.requested", (payload) => {
  void onPdfViewerOpenRequested(payload.path);
});

const disposeDocumentChangedListener = kernel.events.on("app.document.changed", (payload) => {
  windowManager.setDocumentPath(payload.handleId, payload.manifestId, payload.path);
});

const disposeKilledListener = kernel.events.on("app.killed", ({ handleId }) => {
  windowManager.removeByHandleId(handleId);
});

type DesktopWindowRecord = (typeof windowManager.windows)[number];

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
  return windowManager.windows.find((record) => record.manifestId === manifestId && record.focused)
    ?.handleId;
}

function manifestHasSettings(manifestId: string): boolean {
  const manifest = kernel.apps.list().find((entry) => entry.id === manifestId);
  return manifest !== undefined && hasAppSettings(manifest);
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
    const replayed = await replayAppResume(manifest.id, args, source);
    if (!replayed && args !== undefined) {
      debugWarn("[window-host]", "restore — dropping launch args", manifest.id, args);
    }
    return;
  }

  if (windowManager.focusTopOfManifest(manifest.id)) {
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

  const defaultSize =
    manifest.defaultWindow?.width !== undefined && manifest.defaultWindow.height !== undefined
      ? { width: manifest.defaultWindow.width, height: manifest.defaultWindow.height }
      : undefined;
  const initialPosition = centeredInitialPosition(source, defaultSize);

  windowManager.open({
    manifestId: manifest.id,
    handleId: handle.id,
    title: manifest.name,
    singleton: manifest.singleton === true,
    size: defaultSize,
    ...(initialPosition === undefined ? {} : { initial: initialPosition }),
    ...(args === undefined ? {} : { args }),
  });
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
  try {
    return normalizeVfsPath(path);
  } catch (error) {
    debugWarn("[window-host]", `${eventName} invalid path`, path, error);
    return null;
  }
}

function documentPathFor(record: DesktopWindowRecord): string | null | undefined {
  if (record.documentPath !== undefined) {
    return record.documentPath;
  }

  const launchPath = record.args?.path;
  if (typeof launchPath !== "string") {
    return undefined;
  }

  try {
    return normalizeVfsPath(launchPath);
  } catch {
    return undefined;
  }
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

  const defaultSize =
    manifest.defaultWindow?.width !== undefined && manifest.defaultWindow.height !== undefined
      ? { width: manifest.defaultWindow.width, height: manifest.defaultWindow.height }
      : undefined;

  windowManager.open({
    manifestId: manifest.id,
    handleId: handle.id,
    title: manifest.name,
    singleton: manifest.singleton === true,
    size: defaultSize,
    args,
  });
}

function onResize(id: string, x: number, y: number, width: number, height: number): void {
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

  const defaultSize =
    manifest.defaultWindow?.width !== undefined && manifest.defaultWindow.height !== undefined
      ? { width: manifest.defaultWindow.width, height: manifest.defaultWindow.height }
      : undefined;

  windowManager.open({
    manifestId: manifest.id,
    handleId: handle.id,
    title: manifest.name,
    singleton: manifest.singleton === true,
    size: defaultSize,
    ...(args === undefined ? {} : { args }),
  });
}

onBeforeUnmount(() => {
  disposeLaunchListener();
  disposeSpawnNewListener();
  disposeEditorOpenListener();
  disposeBlogPostOpenListener();
  disposePdfViewerOpenListener();
  disposeDocumentChangedListener();
  disposeKilledListener();
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
