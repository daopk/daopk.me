<script setup lang="ts">
import type { TabListOption } from "./types";

interface TabListProps {
  modelValue: string;
  tabs: readonly TabListOption[];
  label: string;
  activeItemClass?: string;
  itemClass?: string;
  size?: "sm" | "md";
}

withDefaults(defineProps<TabListProps>(), {
  activeItemClass: undefined,
  itemClass: undefined,
  size: "md",
});

const emit = defineEmits<{
  "update:modelValue": [next: string];
  change: [next: string];
}>();

function selectTab(tab: TabListOption): void {
  if (tab.disabled) {
    return;
  }

  emit("update:modelValue", tab.value);
  emit("change", tab.value);
}
</script>

<template>
  <div
    class="ds-kit-tab-list"
    :class="`ds-kit-tab-list--${size}`"
    role="tablist"
    :aria-label="label"
  >
    <button
      v-for="tab in tabs"
      :id="tab.id"
      :key="tab.value"
      type="button"
      class="ds-kit-tab-list__tab"
      :class="[
        itemClass,
        { 'ds-kit-tab-list__tab--active': modelValue === tab.value },
        modelValue === tab.value && activeItemClass,
      ]"
      role="tab"
      :aria-selected="modelValue === tab.value"
      :aria-controls="tab.panelId"
      :aria-label="tab.ariaLabel ?? tab.label"
      :disabled="tab.disabled || undefined"
      @click="selectTab(tab)"
    >
      <component :is="tab.icon" v-if="tab.icon" class="ds-kit-tab-list__icon" aria-hidden="true" />
      <span>{{ tab.label }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.ds-kit-tab-list {
  align-items: center;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: inline-flex;
  gap: 2px;
  padding: 2px;
}

.ds-kit-tab-list__tab {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius-md) - 2px);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: var(--space-xs);
  justify-content: center;
  min-inline-size: 0;
  padding: 0 var(--space-sm);
  transition:
    background-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.ds-kit-tab-list--sm .ds-kit-tab-list__tab {
  block-size: 28px;
  font-size: 12px;
}

.ds-kit-tab-list--md .ds-kit-tab-list__tab {
  block-size: 32px;
  font-size: 13px;
}

.ds-kit-tab-list__tab:hover,
.ds-kit-tab-list__tab:focus-visible,
.ds-kit-tab-list__tab--active {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.ds-kit-tab-list__tab--active {
  box-shadow: var(--shadow-sm);
}

.ds-kit-tab-list__tab:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-tab-list__tab:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-tab-list__icon {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-tab-list__tab {
    transition: none;
  }
}
</style>
