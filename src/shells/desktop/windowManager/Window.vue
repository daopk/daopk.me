<script setup vapor lang="ts">
import { computed, useId, useTemplateRef } from "vue";
import { TeleportProvider } from "ropav/teleport-provider";
import MaximizeIcon from "~icons/lucide/maximize-2";
import RestoreIcon from "~icons/lucide/minimize-2";
import MinimizeIcon from "~icons/lucide/minus";
import CloseIcon from "~icons/lucide/x";

import AppIcon from "~/components/AppIcon.vue";
import {
  ButtonGroup,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  IconButton,
} from "~/components/ui";
import { APP_OVERLAY_PORTAL_TARGET } from "~/components/ui/portalTarget";
import { useKernel } from "~/composables/useKernel";
import { hasAppSettings } from "~/core/apps/appSettings";
import type { AppChromeContentSize, AppChromeController } from "~/types/app";
import AppMount from "~/shells/shared/AppMount.vue";
import { type SnapEdge, type WindowRecord } from "./useWindowManager";
import { useWindowFocusScope } from "./useWindowFocusScope";
import { useWindowFrameInteractions } from "./useWindowFrameInteractions";

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
const windowRef = useTemplateRef<HTMLElement>("windowRef");
const overlayRef = useTemplateRef<HTMLElement>("overlayRef");
const manifest = computed(() =>
  kernel.apps.list().find((entry) => entry.id === props.record.manifestId),
);
const showSettingsAction = computed(() =>
  manifest.value === undefined ? false : hasAppSettings(manifest.value),
);

const { activate: activateWindowFocusScope } = useWindowFocusScope({
  windowRef,
  overlayRef,
  getRecord: () => props.record,
  onFocusRequest: (id) => emit("focus:window", id),
});

const { dragging, resizing, drag, resizeDirections, resizeHandlers } = useWindowFrameInteractions({
  getRecord: () => props.record,
  getStageBounds: () => props.stageBounds,
  getStageOffset: () => props.stageOffset,
  onFocus: activateWindowFocusScope,
  onMove: (id, x, y) => emit("move:window", id, x, y),
  onResize: (id, x, y, width, height) => emit("resize:window", id, x, y, width, height),
  onSnap: (id, edge) => emit("snap:window", id, edge),
  onSnapIntent: (id, edge) => emit("snap-intent:window", id, edge),
});

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
  activateWindowFocusScope();
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
  <Teleport :to="APP_OVERLAY_PORTAL_TARGET">
    <div ref="overlayRef" class="window__overlays" :data-window-overlay="record.id" />
  </Teleport>
  <section
    ref="windowRef"
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
    tabindex="-1"
    @pointerdown="onPointerDownAnywhere"
  >
    <TeleportProvider :teleport-to="overlayRef">
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
            <ButtonGroup class="window__actions">
              <IconButton
                class="window__action"
                :ariaLabel="`Minimize ${record.title}`"
                size="xs"
                variant="plain"
                @click="onMinimize"
                @pointerdown.stop
              >
                <MinimizeIcon class="window__action-icon" aria-hidden="true" />
              </IconButton>
              <IconButton
                class="window__action"
                :ariaLabel="maximizeLabel"
                size="xs"
                variant="plain"
                @click="onMaximize"
                @pointerdown.stop
              >
                <RestoreIcon
                  v-if="record.maximized"
                  class="window__action-icon"
                  aria-hidden="true"
                />
                <MaximizeIcon v-else class="window__action-icon" aria-hidden="true" />
              </IconButton>
              <IconButton
                class="window__action window__action--close"
                :ariaLabel="`Close ${record.title}`"
                size="xs"
                variant="plain"
                @click="onClose"
                @pointerdown.stop
              >
                <CloseIcon class="window__action-icon" aria-hidden="true" />
              </IconButton>
            </ButtonGroup>
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
          v-for="direction in resizeDirections"
          :key="direction"
          :class="['window__handle', `window__handle--${direction}`]"
          :data-direction="direction"
          @pointerdown="resizeHandlers[direction]($event)"
        />
      </template>
    </TeleportProvider>
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

.window__overlays {
  display: contents;
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

.window__actions {
  display: inline-flex;
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
