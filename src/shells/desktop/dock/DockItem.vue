<script setup vapor lang="ts">
import { computed } from "vue";

import AppIcon from "~/components/AppIcon.vue";

import type { DockDropPlacement, DockItemModel } from "./types";

const props = withDefaults(
  defineProps<{
    item: DockItemModel;
    running?: boolean;
    attention?: boolean;
    contextMenuOpen?: boolean;
    draggable?: boolean;
    dragging?: boolean;
    dragRemoveTooltipVisible?: boolean;
    dragRemoving?: boolean;
    dragOffsetX?: number;
    dragOffsetY?: number;
    dragOverPlacement?: DockDropPlacement | null;
  }>(),
  {
    running: false,
    attention: false,
    contextMenuOpen: false,
    draggable: false,
    dragging: false,
    dragRemoveTooltipVisible: false,
    dragRemoving: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragOverPlacement: null,
  },
);

const emit = defineEmits<{
  launch: [item: DockItemModel];
  "reorder-pointer-down": [event: PointerEvent, item: DockItemModel];
}>();

const ariaLabel = computed(() => {
  const base =
    props.item.kind === "system"
      ? `Open ${props.item.name}`
      : props.running
        ? `Activate ${props.item.name}`
        : `Launch ${props.item.name}`;

  return props.attention ? `${base}, attention needed` : base;
});

const tooltipLabel = computed(() => (props.dragRemoveTooltipVisible ? "Remove" : props.item.name));

const dragStyle = computed(() =>
  props.dragging
    ? {
        "--dock-drag-x": `${props.dragOffsetX}px`,
        "--dock-drag-y": `${props.dragOffsetY}px`,
      }
    : undefined,
);
</script>

<template>
  <button
    type="button"
    class="dock-item"
    :aria-label="ariaLabel"
    :data-dock-item-key="item.key"
    :data-tooltip="tooltipLabel"
    :data-context-menu-open="contextMenuOpen || undefined"
    :data-draggable="draggable || undefined"
    :data-dragging="dragging || undefined"
    :data-drag-remove-tooltip-visible="dragRemoveTooltipVisible || undefined"
    :data-drag-removing="dragRemoving || undefined"
    :data-drag-over="dragOverPlacement || undefined"
    :style="dragStyle"
    draggable="false"
    @click="emit('launch', item)"
    @pointerdown="emit('reorder-pointer-down', $event, item)"
  >
    <AppIcon :icon="item.icon" class="dock-item__icon" aria-hidden="true" />
    <span v-if="attention" class="dock-item__attention" aria-hidden="true" />
    <span v-if="running" class="dock-item__indicator" aria-hidden="true" />
  </button>
</template>

<style scoped lang="scss">
.dock-item {
  --dock-drag-x: 0px;
  --dock-drag-y: 0px;

  align-items: center;
  background: transparent;
  block-size: var(--dock-icon-size);
  border: none;
  border-radius: var(--radius-md);
  color: var(--menubar-fg);
  cursor: pointer;
  display: inline-flex;
  inline-size: var(--dock-icon-size);
  justify-content: center;
  padding: 0;
  position: relative;
  transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(1);
  transition:
    opacity var(--duration-fast) var(--ease),
    transform 180ms var(--ease);
}

.dock-item[data-draggable] {
  cursor: grab;
}

.dock-item[data-dragging] {
  cursor: grabbing;
  opacity: 0.92;
  pointer-events: none;
  transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(1.12);
  transition: none;
  z-index: 2;
}

.dock-item[data-drag-removing] {
  opacity: 0.5;
  transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(0.92);
}

.dock-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.dock-item:hover:not(:disabled),
.dock-item:focus-visible:not(:disabled) {
  transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(1.08);
}

.dock-item:active:not(:disabled) {
  transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(0.96);
}

.dock-item::after {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  bottom: calc(100% + var(--space-sm));
  box-shadow: var(--shadow-sm);
  color: var(--color-fg);
  content: attr(data-tooltip);
  font-size: var(--menubar-font-size);
  left: 50%;
  opacity: 0;
  padding: var(--space-xs) var(--space-sm);
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, 4px);
  transition:
    opacity 160ms var(--ease),
    transform 160ms var(--ease);
  white-space: nowrap;
  z-index: 1;
}

.dock-item:hover::after,
.dock-item:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.dock-item[data-context-menu-open]::after,
.dock-item[data-dragging]:not([data-drag-remove-tooltip-visible])::after {
  opacity: 0;
  transform: translate(-50%, 4px);
}

.dock-item[data-drag-remove-tooltip-visible]::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.dock-item[data-drag-over]::before {
  background: var(--color-accent);
  block-size: 72%;
  border-radius: var(--radius-sm);
  content: "";
  inline-size: 3px;
  inset-block-start: 14%;
  position: absolute;
  z-index: 1;
}

.dock-item[data-drag-over="before"]::before {
  inset-inline-start: -5px;
}

.dock-item[data-drag-over="after"]::before {
  inset-inline-end: -5px;
}

.dock-item__icon {
  block-size: calc(var(--dock-icon-size) * 0.75);
  filter: var(--dock-icon-shadow);
  inline-size: calc(var(--dock-icon-size) * 0.75);
  transition: filter var(--duration-fast) var(--ease);
}

img.dock-item__icon {
  border-radius: var(--radius-sm);
}

.dock-item__indicator {
  background: var(--dock-indicator-bg);
  block-size: var(--dock-indicator-size);
  border-radius: 50%;
  bottom: calc(var(--dock-indicator-offset) * -1);
  inline-size: var(--dock-indicator-size);
  inset-inline-start: 50%;
  pointer-events: none;
  position: absolute;
  transform: translateX(-50%);
}

.dock-item__attention {
  background: var(--color-accent-sheen);
  block-size: 8px;
  border: 2px solid var(--dock-bg);
  border-radius: 50%;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 50%, transparent);
  inline-size: 8px;
  inset-block-start: 2px;
  inset-inline-end: 2px;
  pointer-events: none;
  position: absolute;
}

@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .dock-item::after {
    backdrop-filter: blur(var(--dock-blur));
    -webkit-backdrop-filter: blur(var(--dock-blur));
    background: var(--dock-bg);
  }
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .dock-item::after {
    background: var(--color-bg-elevated);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock-item {
    transition: none;
  }

  .dock-item:hover:not(:disabled),
  .dock-item:focus-visible:not(:disabled),
  .dock-item:active:not(:disabled) {
    transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(1);
  }

  .dock-item[data-dragging] {
    transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(1.06);
  }

  .dock-item[data-drag-removing] {
    transform: translate(var(--dock-drag-x), var(--dock-drag-y)) scale(0.96);
  }

  .dock-item::after {
    opacity: 0;
    transform: translate(-50%, 0);
    transition: none;
  }

  .dock-item:hover::after,
  .dock-item:focus-visible::after {
    opacity: 1;
  }
}
</style>
