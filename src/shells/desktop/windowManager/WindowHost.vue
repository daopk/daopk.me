<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from "vue";
import { useElementBounding, useResizeObserver } from "@vueuse/core";

import { useKernel } from "~/composables/useKernel";
import { hasAppSettings } from "~/core/apps/appSettings";
import { debugWarn } from "~/core/debug";
import { AppLaunchError } from "~/core/kernel/errors";
import { emitAppResume, resolveAppResume } from "~/core/routing/appResume";
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
  ([width, height]) => {
    windowManager.rebindToStage({ width, height });
  },
);

const disposeLaunchListener = kernel.events.on("app.launch.requested", (payload) => {
  void onLaunchRequested(payload.manifestId, payload.args, payload.source);
});

const disposeSpawnNewListener = kernel.events.on("app.spawn.new", (payload) => {
  void onSpawnNewRequested(payload.manifestId, payload.args);
});

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
      windowManager.toggleMaximize(id, stageBounds);
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

function onResize(id: string, x: number, y: number, width: number, height: number): void {
  windowManager.setBounds(id, x, y, width, height);
}

function onMaximize(id: string): void {
  windowManager.toggleMaximize(id, stageBounds);
}

function onSnap(id: string, edge: SnapEdge): void {
  windowManager.snapTo(id, edge, stageBounds);
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
  for (const dispose of disposeWindowCommands) {
    dispose();
  }
});
</script>

<template>
  <div ref="hostRef" class="window-host">
    <Transition name="snap-preview">
      <SnapPreview v-if="activeSnap" :edge="activeSnap.edge" :stage="stageBounds" />
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
