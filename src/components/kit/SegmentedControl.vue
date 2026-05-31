<script setup lang="ts">
import type { SegmentedControlOption } from "./types";

interface SegmentedControlProps {
  modelValue: string;
  options: readonly SegmentedControlOption[];
  label: string;
  showLabels?: boolean;
  size?: "sm" | "md";
}

withDefaults(defineProps<SegmentedControlProps>(), {
  showLabels: true,
  size: "md",
});

const emit = defineEmits<{
  "update:modelValue": [next: string];
  change: [next: string];
}>();

function selectOption(option: SegmentedControlOption): void {
  if (option.disabled) {
    return;
  }

  emit("update:modelValue", option.value);
  emit("change", option.value);
}
</script>

<template>
  <div
    class="ds-kit-segmented-control"
    :class="[
      `ds-kit-segmented-control--${size}`,
      !showLabels && 'ds-kit-segmented-control--icon-only',
    ]"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="ds-kit-segmented-control__item"
      :class="{ 'ds-kit-segmented-control__item--active': modelValue === option.value }"
      :aria-pressed="modelValue === option.value"
      :aria-label="option.ariaLabel ?? option.label"
      :data-value="option.value"
      :disabled="option.disabled || undefined"
      :title="option.ariaLabel ?? option.label"
      @click="selectOption(option)"
    >
      <component
        :is="option.icon"
        v-if="option.icon"
        class="ds-kit-segmented-control__icon"
        aria-hidden="true"
      />
      <span v-if="showLabels" class="ds-kit-segmented-control__label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.ds-kit-segmented-control {
  align-items: center;
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
  border-radius: var(--radius-md);
  display: inline-flex;
  flex: 0 0 auto;
  gap: 1px;
  padding: 2px;
}

.ds-kit-segmented-control__item {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
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
    color var(--duration-fast) var(--ease);
}

.ds-kit-segmented-control--sm .ds-kit-segmented-control__item {
  block-size: 28px;
  font-size: 12px;
}

.ds-kit-segmented-control--md .ds-kit-segmented-control__item {
  block-size: 32px;
  font-size: 13px;
}

.ds-kit-segmented-control--icon-only.ds-kit-segmented-control--sm .ds-kit-segmented-control__item {
  inline-size: 28px;
  padding: 0;
}

.ds-kit-segmented-control--icon-only.ds-kit-segmented-control--md .ds-kit-segmented-control__item {
  inline-size: 32px;
  padding: 0;
}

.ds-kit-segmented-control__item:hover,
.ds-kit-segmented-control__item:focus-visible,
.ds-kit-segmented-control__item--active {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.ds-kit-segmented-control__item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-segmented-control__item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-segmented-control__icon {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
}

.ds-kit-segmented-control__label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-segmented-control__item {
    transition: none;
  }
}
</style>
