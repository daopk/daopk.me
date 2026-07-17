<script setup vapor lang="ts">
import { computed, type Component } from "vue";

/**
 * Canonical renderer for an app/identity icon. The resolved icon is always a
 * Vue component: built-in apps import a generated image glyph directly, while
 * first-party apps resolve an app-owned image icon (their release-shipped
 * `icon.png`) at registration. This centralizes the `size`/`strokeWidth`
 * contract and the fallback, and lets `class` + `aria-*` fall through to the
 * underlying svg/img so existing call-site styling keeps working.
 */
const props = defineProps<{
  icon?: Component | null;
  /** Used when `icon` is absent — e.g. a generic slot icon for widget tiles. */
  fallback?: Component | null;
  size?: number | string;
  strokeWidth?: number | string;
}>();

const resolved = computed<Component | null>(() => props.icon ?? props.fallback ?? null);
</script>

<template>
  <component :is="resolved" v-if="resolved" :size="size" :stroke-width="strokeWidth" />
</template>
