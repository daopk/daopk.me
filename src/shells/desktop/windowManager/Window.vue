<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  Maximize2 as MaximizeIcon,
  Minimize2 as RestoreIcon,
  Minus as MinimizeIcon,
  X as CloseIcon,
} from "~/icons/lucide";

import AppIcon from "~/components/AppIcon.vue";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { hasAppSettings } from "~/core/apps/appSettings";
import type { AppChromeContentSize, AppChromeController } from "~/types/app";
import AppMount from "~/shells/shared/AppMount.vue";
import { TITLEBAR_HEIGHT, type SnapEdge, type WindowRecord } from "./useWindowManager";
import { clampWindowPosition } from "./windowGeometry";
import { useWindowDrag } from "./useWindowDrag";
import { useWindowResize, type ResizeDirection } from "./useWindowResize";
import { SNAP_ENTER, SNAP_EXIT } from "./snapConfig";

const props = defineProps<{
  record: WindowRecord;
  stageBounds: { width: number; height: number };
  stageOffset?: { x: number; y: number };
}>();

const emit = defineEmits<{
  "focus:window": [id: string];
  "close:window": [id: string];
  "move:window": [id: string, x: number, y: number];
  "resize:window": [id: string, x: number, y: number, width: number, height: number];
  "maximize:window": [id: string];
  "minimize:window": [id: string];
  "snap:window": [id: string, edge: SnapEdge];
  "snap-intent:window": [id: string, edge: SnapEdge | null];
  "title:window": [id: string, title: string];
  "content-size:window": [id: string, size: AppChromeContentSize | null];
}>();

const titleId = useId();
const kernel = useKernel();
const dragging = ref(false);
const resizing = ref(false);
const snapIntent = ref<SnapEdge | null>(null);
const manifest = computed(() =>
  kernel.apps.list().find((entry) => entry.id === props.record.manifestId),
);
const showSettingsAction = computed(() =>
  manifest.value === undefined ? false : hasAppSettings(manifest.value),
);

function clampPosition(x: number, y: number): { x: number; y: number } {
  return clampWindowPosition(x, y, {
    stageWidth: props.stageBounds.width,
    stageHeight: props.stageBounds.height,
    windowWidth: props.record.width,
    titlebarHeight: TITLEBAR_HEIGHT,
  });
}

function clampResize(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const { width: stageW, height: stageH } = props.stageBounds;

  if (stageW <= 0 || stageH <= 0) {
    return { x, y, width, height };
  }

  const cx = Math.max(0, x);
  const cy = Math.max(0, y);
  const adjW = width + (x - cx);
  const adjH = height + (y - cy);

  const cw = Math.min(adjW, stageW - cx);
  const ch = Math.min(adjH, stageH - cy);

  return { x: cx, y: cy, width: cw, height: ch };
}

function setSnapIntent(next: SnapEdge | null): void {
  if (snapIntent.value === next) {
    return;
  }

  snapIntent.value = next;
  emit("snap-intent:window", props.record.id, next);
}

function nextSnapIntent(stageX: number, stageY: number, width: number): SnapEdge | null {
  if (stageY <= SNAP_ENTER) {
    return "max";
  }

  if (stageX <= SNAP_ENTER) {
    return "left";
  }

  if (stageX >= width - SNAP_ENTER) {
    return "right";
  }

  const current = snapIntent.value;

  if (current === "max" && stageY <= SNAP_EXIT) {
    return "max";
  }

  if (current === "left" && stageX <= SNAP_EXIT) {
    return "left";
  }

  if (current === "right" && stageX >= width - SNAP_EXIT) {
    return "right";
  }

  return null;
}

function updateSnapIntent(clientX: number, clientY: number): void {
  if (props.record.maximized) {
    setSnapIntent(null);

    return;
  }

  const { width } = props.stageBounds;

  // Bail until the ResizeObserver populates stageBounds — without a known
  if (width <= 0) {
    setSnapIntent(null);

    return;
  }

  const offsetX = props.stageOffset?.x ?? 0;
  const offsetY = props.stageOffset?.y ?? 0;
  const stageX = clientX - offsetX;
  const stageY = clientY - offsetY;

  setSnapIntent(nextSnapIntent(stageX, stageY, width));
}

const drag = useWindowDrag({
  getPosition: () => ({ x: props.record.x, y: props.record.y }),
  onMove: (x, y, pointerX, pointerY) => {
    const clamped = clampPosition(x, y);
    emit("move:window", props.record.id, clamped.x, clamped.y);
    updateSnapIntent(pointerX, pointerY);
  },
  onStart: () => {
    dragging.value = true;
    setSnapIntent(null);
    emit("focus:window", props.record.id);
  },
  onEnd: () => {
    dragging.value = false;

    const pending = snapIntent.value;

    setSnapIntent(null);

    if (pending !== null) {
      emit("snap:window", props.record.id, pending);
    }
  },
});

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function buildResizeHandlers(): Record<ResizeDirection, (event: PointerEvent) => void> {
  const sharedOptions = {
    getBounds: () => ({
      x: props.record.x,
      y: props.record.y,
      width: props.record.width,
      height: props.record.height,
    }),
    onResize: (x: number, y: number, width: number, height: number) => {
      const clamped = clampResize(x, y, width, height);
      emit("resize:window", props.record.id, clamped.x, clamped.y, clamped.width, clamped.height);
    },
    onStart: () => {
      resizing.value = true;
      emit("focus:window", props.record.id);
    },
    onEnd: () => {
      resizing.value = false;
    },
  };

  const handlers = {} as Record<ResizeDirection, (event: PointerEvent) => void>;

  for (const direction of RESIZE_DIRECTIONS) {
    handlers[direction] = useWindowResize({ ...sharedOptions, direction }).onPointerDown;
  }

  return handlers;
}

const resizeHandlers = buildResizeHandlers();

const style = computed<Record<string, string>>(() => ({
  left: `${props.record.x.toString()}px`,
  top: `${props.record.y.toString()}px`,
  inlineSize: `${props.record.width.toString()}px`,
  blockSize: `${props.record.height.toString()}px`,
  "--window-min-w": `${props.record.minWidth.toString()}px`,
  "--window-min-h": `${props.record.minHeight.toString()}px`,
  zIndex: props.record.z.toString(),
}));

const maximizeLabel = computed(() =>
  props.record.maximized ? `Restore ${props.record.title}` : `Maximize ${props.record.title}`,
);

function fallbackWindowTitle(): string {
  return manifest.value?.name ?? props.record.title;
}

function normalizeWindowTitle(title: string | null): string {
  const trimmed = title?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallbackWindowTitle();
}

const appChrome: AppChromeController = {
  rendersAppChrome: false,
  setTitle(title) {
    emit("title:window", props.record.id, normalizeWindowTitle(title));
  },
  setBackAction() {},
  setContentSize(size) {
    emit("content-size:window", props.record.id, size);
  },
  hide() {
    emit("minimize:window", props.record.id);
  },
  close() {
    emit("close:window", props.record.id);
  },
};

function onPointerDownAnywhere(): void {
  if (!props.record.focused) {
    emit("focus:window", props.record.id);
  }
}

function onMaximize(event: MouseEvent): void {
  event.stopPropagation();
  emit("maximize:window", props.record.id);
}

function onMinimize(event: MouseEvent): void {
  event.stopPropagation();
  emit("minimize:window", props.record.id);
}

function onClose(event: MouseEvent): void {
  event.stopPropagation();
  emit("close:window", props.record.id);
}

function dispatchWindowCommand(id: string): void {
  void kernel.commands.dispatch(id, {
    source: "menu",
    payload: { windowId: props.record.id },
  });
}
</script>

<template>
  <section
    class="window"
    :class="{
      'window--focused': record.focused,
      'window--dragging': dragging,
      'window--resizing': resizing,
      'window--maximized': record.maximized,
    }"
    :style="style"
    :data-window-id="record.id"
    :data-dragging="dragging ? 'true' : 'false'"
    :data-snap="record.snap ?? 'none'"
    role="dialog"
    aria-modal="false"
    :aria-labelledby="titleId"
    @pointerdown="onPointerDownAnywhere"
  >
    <ContextMenu>
      <template #trigger>
        <header
          class="window__titlebar"
          :class="{ 'window__titlebar--locked': record.maximized }"
          @pointerdown="record.maximized ? null : drag.onPointerDown($event)"
          @dblclick="onMaximize"
        >
          <AppIcon
            v-if="manifest"
            :icon="manifest.icon"
            class="window__title-icon"
            aria-hidden="true"
          />
          <span :id="titleId" class="window__title">{{ record.title }}</span>
          <button
            type="button"
            class="window__action"
            :aria-label="`Minimize ${record.title}`"
            @click="onMinimize"
            @pointerdown.stop
          >
            <MinimizeIcon class="window__action-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="window__action"
            :aria-label="maximizeLabel"
            @click="onMaximize"
            @pointerdown.stop
          >
            <RestoreIcon v-if="record.maximized" class="window__action-icon" aria-hidden="true" />
            <MaximizeIcon v-else class="window__action-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="window__action window__action--close"
            :aria-label="`Close ${record.title}`"
            @click="onClose"
            @pointerdown.stop
          >
            <CloseIcon class="window__action-icon" aria-hidden="true" />
          </button>
        </header>
      </template>
      <template #items>
        <ContextMenuItem @select="dispatchWindowCommand('desktop:window.minimize')">
          Minimize
        </ContextMenuItem>
        <ContextMenuItem @select="dispatchWindowCommand('desktop:window.toggleMaximize')">
          {{ record.maximized ? "Restore" : "Maximize" }}
        </ContextMenuItem>
        <ContextMenuItem
          v-if="showSettingsAction"
          @select="dispatchWindowCommand('desktop:window.openSettings')"
        >
          Settings
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="dispatchWindowCommand('desktop:window.close')">
          Close
        </ContextMenuItem>
      </template>
    </ContextMenu>
    <div class="window__body">
      <AppMount
        :key="`${record.handleId}:${record.argsRevision}`"
        :manifest-id="record.manifestId"
        :handle-id="record.handleId"
        :focused="record.focused"
        :args="record.args"
        :chrome="appChrome"
      />
    </div>
    <template v-if="!record.maximized">
      <span
        v-for="direction in RESIZE_DIRECTIONS"
        :key="direction"
        :class="['window__handle', `window__handle--${direction}`]"
        :data-direction="direction"
        @pointerdown="resizeHandlers[direction]($event)"
      />
    </template>
  </section>
</template>

<style scoped lang="scss">
.window {
  background: var(--window-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--window-radius);
  box-shadow: var(--window-shadow);
  color: var(--window-fg);
  display: flex;
  flex-direction: column;
  min-block-size: var(--window-min-h);
  min-inline-size: var(--window-min-w);
  overflow: hidden;
  position: absolute;
  transition: box-shadow 160ms var(--ease);
}

.window--focused {
  box-shadow: var(--window-shadow-focused);
}

.window--dragging .window__titlebar {
  cursor: grabbing;
}

.window--maximized {
  border-radius: 0;
}

.window__titlebar {
  align-items: center;
  background: var(--window-titlebar-bg);
  block-size: var(--window-titlebar-h);
  border-block-end: 1px solid var(--color-border);
  color: var(--window-titlebar-fg-muted);
  cursor: grab;
  display: flex;
  gap: var(--space-sm);
  padding: 0 var(--space-sm);
  touch-action: none;
  user-select: none;
}

.window__titlebar--locked {
  cursor: default;
}

.window--focused .window__titlebar {
  color: var(--window-titlebar-fg);
}

.window__title-icon {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
}

.window__title {
  flex: 1;
  font-size: var(--menubar-font-size);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window__action {
  align-items: center;
  background: transparent;
  block-size: 20px;
  border: none;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  inline-size: 20px;
  justify-content: center;
  padding: 0;
}

.window__action:hover {
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
}

.window__action:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.window__action-icon {
  block-size: 14px;
  inline-size: 14px;
}

.window__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
  overflow: auto;
}

.window__handle {
  position: absolute;
  touch-action: none;
  z-index: 2;
}

.window__handle--n {
  block-size: var(--window-handle-size);
  cursor: ns-resize;
  inset-block-start: calc(var(--window-handle-size) * -0.5);
  inset-inline: 0;
}

.window__handle--s {
  block-size: var(--window-handle-size);
  cursor: ns-resize;
  inset-block-end: calc(var(--window-handle-size) * -0.5);
  inset-inline: 0;
}

.window__handle--e {
  cursor: ew-resize;
  inline-size: var(--window-handle-size);
  inset-block: 0;
  inset-inline-end: calc(var(--window-handle-size) * -0.5);
}

.window__handle--w {
  cursor: ew-resize;
  inline-size: var(--window-handle-size);
  inset-block: 0;
  inset-inline-start: calc(var(--window-handle-size) * -0.5);
}

.window__handle--ne,
.window__handle--nw,
.window__handle--se,
.window__handle--sw {
  block-size: var(--window-handle-corner);
  inline-size: var(--window-handle-corner);
  z-index: 3;
}

.window__handle--ne {
  cursor: nesw-resize;
  inset-block-start: calc(var(--window-handle-corner) * -0.5);
  inset-inline-end: calc(var(--window-handle-corner) * -0.5);
}

.window__handle--nw {
  cursor: nwse-resize;
  inset-block-start: calc(var(--window-handle-corner) * -0.5);
  inset-inline-start: calc(var(--window-handle-corner) * -0.5);
}

.window__handle--se {
  cursor: nwse-resize;
  inset-block-end: calc(var(--window-handle-corner) * -0.5);
  inset-inline-end: calc(var(--window-handle-corner) * -0.5);
}

.window__handle--sw {
  cursor: nesw-resize;
  inset-block-end: calc(var(--window-handle-corner) * -0.5);
  inset-inline-start: calc(var(--window-handle-corner) * -0.5);
}

@media (prefers-reduced-motion: reduce) {
  .window {
    transition: none;
  }
}
</style>
