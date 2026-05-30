<script setup lang="ts">
import { ref } from "vue";

interface AppFrameProps {
  as?: keyof HTMLElementTagNameMap;
  background?: "default" | "subtle";
  layout?: "block" | "flex-column" | "grid";
  safeArea?: boolean;
}

withDefaults(defineProps<AppFrameProps>(), {
  as: "section",
  background: "default",
  layout: "block",
  safeArea: true,
});

const element = ref<HTMLElement | null>(null);

defineExpose({ element });
</script>

<template>
  <component
    ref="element"
    :is="as"
    class="ds-kit-app-frame"
    :class="[
      `ds-kit-app-frame--${background}`,
      `ds-kit-app-frame--${layout}`,
      safeArea && 'ds-kit-app-frame--safe-area',
    ]"
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

.ds-kit-app-frame--safe-area {
  padding-block-end: var(--mobile-shell-app-bottom-padding, 0px);
  padding-inline-end: var(--mobile-shell-app-safe-area-right, 0px);
  padding-inline-start: var(--mobile-shell-app-safe-area-left, 0px);
}
</style>
