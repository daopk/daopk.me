<script setup lang="ts">
import { ref } from "vue";

interface ScrollAreaProps {
  as?: keyof HTMLElementTagNameMap;
  axis?: "vertical" | "horizontal" | "both";
  /** Pad the scroll content past the bottom safe area (home indicator). */
  safeArea?: boolean;
}

withDefaults(defineProps<ScrollAreaProps>(), {
  as: "div",
  axis: "vertical",
  safeArea: false,
});

const element = ref<HTMLElement | null>(null);

defineExpose({ element });
</script>

<template>
  <component
    ref="element"
    :is="as"
    class="ds-kit-scroll-area"
    :class="[`ds-kit-scroll-area--${axis}`, safeArea && 'ds-kit-scroll-area--safe-area']"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.ds-kit-scroll-area {
  min-block-size: 0;
  min-inline-size: 0;
  // Keep scrolling inside the region instead of chaining to the shell, and
  // momentum-scroll on legacy WebKit.
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-color: color-mix(in srgb, var(--color-fg) 24%, transparent) transparent;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    block-size: 10px;
    inline-size: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-fg) 22%, transparent);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-radius: var(--radius-full);
  }

  &::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--color-fg) 36%, transparent);
    background-clip: padding-box;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.ds-kit-scroll-area--vertical {
  overflow-x: hidden;
  overflow-y: auto;
}

.ds-kit-scroll-area--horizontal {
  overflow-x: auto;
  overflow-y: hidden;
}

.ds-kit-scroll-area--both {
  overflow: auto;
}

.ds-kit-scroll-area--safe-area {
  padding-block-end: var(--mobile-shell-app-bottom-padding, 0px);
}
</style>
