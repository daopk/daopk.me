<script setup vapor lang="ts">
import { computed, ref } from "vue";

/**
 * - `true` (default): bottom + horizontal insets — the historical behavior.
 * - `"all"`: top + bottom + horizontal, for full-bleed apps that draw under
 *   shell chrome.
 * - `"bottom"`: bottom only, when the app manages its own horizontal insets.
 * - `false`: no inset padding; the app owns every edge.
 */
type SafeArea = boolean | "bottom" | "all";

interface AppFrameProps {
  as?: keyof HTMLElementTagNameMap;
  background?: "default" | "subtle";
  layout?: "block" | "flex-column" | "grid";
  safeArea?: SafeArea;
}

const props = withDefaults(defineProps<AppFrameProps>(), {
  as: "section",
  background: "default",
  layout: "block",
  safeArea: true,
});

const element = ref<HTMLElement | null>(null);

const safeAreaClasses = computed<string[]>(() => {
  const mode = props.safeArea;
  if (mode === false) {
    return [];
  }
  if (mode === "bottom") {
    return ["ds-kit-app-frame--safe-bottom"];
  }
  if (mode === "all") {
    return [
      "ds-kit-app-frame--safe-top",
      "ds-kit-app-frame--safe-bottom",
      "ds-kit-app-frame--safe-x",
    ];
  }
  return ["ds-kit-app-frame--safe-bottom", "ds-kit-app-frame--safe-x"];
});

defineExpose({ element });
</script>

<template>
  <component
    ref="element"
    :is="as"
    class="ds-kit-app-frame"
    :class="[`ds-kit-app-frame--${background}`, `ds-kit-app-frame--${layout}`, safeAreaClasses]"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-app-frame {
  block-size: 100%;
  color: var(--color-fg);
  inline-size: 100%;
  min-block-size: 0;
}

.ds-kit-app-frame--default {
  background: var(--color-bg);
}

.ds-kit-app-frame--subtle {
  background: var(--color-bg-subtle);
}

.ds-kit-app-frame--block {
  display: block;
}

.ds-kit-app-frame--flex-column {
  display: flex;
  flex-direction: column;
}

.ds-kit-app-frame--grid {
  display: grid;
}

.ds-kit-app-frame--safe-x {
  padding-inline-end: var(--mobile-shell-app-safe-area-right, 0px);
  padding-inline-start: var(--mobile-shell-app-safe-area-left, 0px);
}

.ds-kit-app-frame--safe-bottom {
  padding-block-end: var(--mobile-shell-app-bottom-padding, 0px);
}

.ds-kit-app-frame--safe-top {
  padding-block-start: var(--mobile-shell-app-safe-area-top, 0px);
}
</style>
