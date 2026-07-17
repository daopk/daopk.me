<script setup vapor lang="ts">
import {
  computed,
  defineAsyncComponent,
  markRaw,
  onUnmounted,
  shallowRef,
  type Component,
} from "vue";

import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import { widgetDefaultVisible } from "~/core/widgets/catalog";
import type { WidgetManifest, WidgetSize } from "~/types/widget";

const kernel = useKernel();

const widgets = shallowRef<readonly WidgetManifest[]>(
  kernel.widgets.list({ surface: "mobile:widgets" }),
);

function refresh(): void {
  widgets.value = kernel.widgets.list({ surface: "mobile:widgets" });
}

const stopRegistered = kernel.events.on("widget.registered", refresh);
const stopUnregistered = kernel.events.on("widget.unregistered", refresh);

const { enabled: enabledMap, isEnabled } = useWidgetEnabled("mobile");

const enabledWidgets = computed<readonly WidgetManifest[]>(() => {
  void enabledMap.value;
  return widgets.value.filter((m) => isEnabled(m.id, widgetDefaultVisible(m)));
});

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
});

const asyncComponentCache = new WeakMap<WidgetManifest, Component>();

function resolveComponent(manifest: WidgetManifest): Component {
  const cached = asyncComponentCache.get(manifest);
  if (cached) return cached;
  const wrapped = markRaw(defineAsyncComponent(manifest.component));
  asyncComponentCache.set(manifest, wrapped);
  return wrapped;
}

function slotClass(size: WidgetSize): string {
  return `widget-slot widget-slot--${size}`;
}
</script>

<template>
  <div class="mobile-widgets-page">
    <section
      v-if="enabledWidgets.length === 0"
      class="mobile-widgets-page__empty"
      role="status"
      aria-label="No widgets"
    >
      <p>Widgets will appear here when an app provides one.</p>
    </section>
    <section v-else class="mobile-widgets-page__grid" aria-label="Widgets">
      <div
        v-for="manifest in enabledWidgets"
        :key="manifest.id"
        :class="slotClass(manifest.size)"
        :data-widget-id="manifest.id"
      >
        <component :is="resolveComponent(manifest)" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.mobile-widgets-page {
  block-size: 100%;
  inline-size: 100%;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding-block-end: calc(
    var(--home-screen-padding-block) + 96px + var(--mobile-shell-safe-area-bottom, 0px)
  );
  padding-block-start: calc(
    var(--home-screen-padding-block) + var(--mobile-shell-safe-area-top, 0px)
  );
  padding-inline-end: calc(
    var(--home-screen-padding-inline) + var(--mobile-shell-safe-area-right, 0px)
  );
  padding-inline-start: calc(
    var(--home-screen-padding-inline) + var(--mobile-shell-safe-area-left, 0px)
  );
}

.mobile-widgets-page__empty {
  align-items: center;
  block-size: 100%;
  color: var(--color-fg-muted);
  display: flex;
  font-size: 14px;
  inline-size: 100%;
  justify-content: center;
  text-align: center;
}

.mobile-widgets-page__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 110px;
  gap: var(--home-screen-grid-gap-y) var(--home-screen-grid-gap-x);
}

.widget-slot {
  block-size: 100%;
  inline-size: 100%;
}

.widget-slot--sm {
  grid-column: span 1;
  grid-row: span 1;
}

.widget-slot--md {
  grid-column: span 2;
  grid-row: span 1;
}

.widget-slot--lg {
  grid-column: span 2;
  grid-row: span 2;
}
</style>
