<script setup vapor lang="ts">
import { computed, defineVaporAsyncComponent, markRaw, ref, type VaporComponent } from "vue";

import { ContextMenu, ContextMenuItem } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { gridToPixels, widgetPixelDimensions } from "~/core/widgets/sizing";
import type { WidgetManifest } from "~/types/widget";
import { verifiedVaporLoader } from "~/utils/vaporComponent";

import { useWidgetDrag } from "./useWidgetDrag";

const props = defineProps<{
  manifest: WidgetManifest;
  placement: { gridX: number; gridY: number };
  hostSize: { width: number; height: number };
}>();

const kernel = useKernel();

const emit = defineEmits<{
  drop: [id: string, gridX: number, gridY: number];
}>();

const dragPosition = ref<{ x: number; y: number } | null>(null);

/** Lifted z-index toggle for the drag-on-top affordance. */
const dragging = ref(false);

const pixelSize = computed(() => widgetPixelDimensions(props.manifest.size));

const persistedPixelPosition = computed(() => ({
  x: gridToPixels(props.placement.gridX),
  y: gridToPixels(props.placement.gridY),
}));

const renderPosition = computed(() =>
  dragPosition.value !== null ? dragPosition.value : persistedPixelPosition.value,
);

const slotStyle = computed(() => ({
  width: `${pixelSize.value.width}px`,
  height: `${pixelSize.value.height}px`,
  transform: `translate3d(${renderPosition.value.x}px, ${renderPosition.value.y}px, 0)`,
  // base). Token instead of inline `calc()` gives future stacking
  zIndex: dragging.value ? "var(--desktop-widget-drag-z)" : undefined,
}));

const dragHandlers = useWidgetDrag({
  getPosition: () => persistedPixelPosition.value,
  getSize: () => pixelSize.value,
  getHostSize: () => props.hostSize,
  onStart: (): void => {
    dragging.value = true;
  },
  onMove: (x, y): void => {
    dragPosition.value = { x, y };
  },
  onDrop: (gridX, gridY): void => {
    emit("drop", props.manifest.id, gridX, gridY);
  },
  onEnd: (): void => {
    // race against the override. The next reactive tick paints from
    dragPosition.value = null;
    dragging.value = false;
  },
});

const asyncComponentCache = new WeakMap<WidgetManifest, VaporComponent>();
function resolveComponent(manifest: WidgetManifest): VaporComponent {
  const cached = asyncComponentCache.get(manifest);
  if (cached) return cached;
  const wrapped = markRaw(
    defineVaporAsyncComponent(verifiedVaporLoader(manifest.component, `Widget ${manifest.id}`)),
  );
  asyncComponentCache.set(manifest, wrapped);
  return wrapped;
}

function onRemoveFromDesktop(): void {
  void kernel.commands.dispatch("desktop:widget.remove", {
    source: "menu",
    payload: { widgetId: props.manifest.id },
  });
}
</script>

<template>
  <div class="desktop-widget-slot-host">
    <ContextMenu>
      <template #trigger>
        <div
          class="desktop-widget-slot"
          role="figure"
          :aria-label="manifest.title"
          :data-widget-id="manifest.id"
          :data-dragging="dragging || undefined"
          :style="slotStyle"
          @pointerdown="dragHandlers.onPointerDown"
        >
          <component :is="resolveComponent(manifest)" />
        </div>
      </template>
      <template #items>
        <ContextMenuItem @select="onRemoveFromDesktop">Remove from desktop</ContextMenuItem>
      </template>
    </ContextMenu>
  </div>
</template>

<style scoped lang="scss">
.desktop-widget-slot-host {
  display: contents;
}

.desktop-widget-slot {
  inset: 0 auto auto 0;
  position: absolute;
  user-select: none;
  cursor: grab;
  // its visuals. Keeping the slot chrome-less lets a widget with

  &[data-dragging] {
    cursor: grabbing;
    // feel like passive desktop chrome, not floating cards.
    transition: none;
  }

  &[data-dragging] :deep(*) {
    pointer-events: none;
  }
}
</style>
