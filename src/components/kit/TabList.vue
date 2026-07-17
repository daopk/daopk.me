<script setup vapor lang="ts">
import { computed, nextTick, ref } from "vue";

import type { TabListOption } from "./types";

interface TabListProps {
  modelValue: string;
  tabs: readonly TabListOption[];
  label: string;
  activeItemClass?: string;
  itemClass?: string;
  size?: "sm" | "md";
}

const props = withDefaults(defineProps<TabListProps>(), {
  activeItemClass: undefined,
  itemClass: undefined,
  size: "md",
});

const emit = defineEmits<{
  "update:modelValue": [next: string];
  change: [next: string];
}>();

const listRef = ref<HTMLElement | null>(null);

// The single tab in the page tab sequence (roving tabindex): the selected one
// when it is enabled, otherwise the first enabled tab.
const focusableValue = computed(() => {
  const active = props.tabs.find((tab) => tab.value === props.modelValue && !tab.disabled);
  if (active) {
    return active.value;
  }
  return props.tabs.find((tab) => !tab.disabled)?.value;
});

function selectTab(tab: TabListOption): void {
  if (tab.disabled) {
    return;
  }

  emit("update:modelValue", tab.value);
  emit("change", tab.value);
}

function focusValue(value: string): void {
  void nextTick(() => {
    const buttons = Array.from(
      listRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    );
    buttons.find((button) => button.dataset.value === value)?.focus();
  });
}

function moveFocus(current: string, direction: 1 | -1 | "home" | "end"): void {
  const enabled = props.tabs.filter((tab) => !tab.disabled);
  if (enabled.length === 0) {
    return;
  }

  let nextIndex: number;
  if (direction === "home") {
    nextIndex = 0;
  } else if (direction === "end") {
    nextIndex = enabled.length - 1;
  } else {
    const currentIndex = enabled.findIndex((tab) => tab.value === current);
    const base = currentIndex === -1 ? 0 : currentIndex;
    nextIndex = (base + direction + enabled.length) % enabled.length;
  }

  const next = enabled[nextIndex];
  if (!next) {
    return;
  }

  selectTab(next);
  focusValue(next.value);
}

function onKeydown(event: KeyboardEvent, tab: TabListOption): void {
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      event.preventDefault();
      moveFocus(tab.value, 1);
      break;
    case "ArrowLeft":
    case "ArrowUp":
      event.preventDefault();
      moveFocus(tab.value, -1);
      break;
    case "Home":
      event.preventDefault();
      moveFocus(tab.value, "home");
      break;
    case "End":
      event.preventDefault();
      moveFocus(tab.value, "end");
      break;
    default:
      break;
  }
}
</script>

<template>
  <div
    ref="listRef"
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
      :data-value="tab.value"
      :tabindex="tab.value === focusableValue ? 0 : -1"
      :aria-selected="modelValue === tab.value"
      :aria-controls="tab.panelId"
      :aria-label="tab.ariaLabel ?? tab.label"
      :disabled="tab.disabled || undefined"
      @click="selectTab(tab)"
      @keydown="onKeydown($event, tab)"
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
  gap: var(--space-2xs);
  padding: var(--space-2xs);
}

.ds-kit-tab-list__tab {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius-md) - var(--space-2xs));
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
  block-size: var(--control-height-sm);
  font-size: var(--font-size-xs);
}

.ds-kit-tab-list--md .ds-kit-tab-list__tab {
  block-size: var(--control-height-md);
  font-size: var(--font-size-sm);
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
