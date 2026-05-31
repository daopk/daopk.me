<script setup lang="ts">
import { Check } from "~/icons/lucide";

interface CheckboxProps {
  modelValue?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

withDefaults(defineProps<CheckboxProps>(), {
  modelValue: false,
  disabled: false,
  ariaLabel: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [next: boolean];
}>();

function onChange(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <label class="ds-kit-checkbox" :class="{ 'ds-kit-checkbox--disabled': disabled }">
    <span class="ds-kit-checkbox__control">
      <input
        type="checkbox"
        class="ds-kit-checkbox__input"
        :checked="modelValue"
        :disabled="disabled"
        :aria-label="ariaLabel"
        @change="onChange"
      />
      <Check class="ds-kit-checkbox__check" :size="14" :stroke-width="3" aria-hidden="true" />
    </span>
    <span v-if="$slots.default" class="ds-kit-checkbox__label"><slot /></span>
  </label>
</template>

<style scoped lang="scss">
.ds-kit-checkbox {
  align-items: center;
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  font-size: var(--font-size-sm);
  gap: var(--space-sm);
}

.ds-kit-checkbox--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-checkbox__control {
  block-size: 18px;
  flex: 0 0 auto;
  inline-size: 18px;
  position: relative;
}

.ds-kit-checkbox__input {
  appearance: none;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: inherit;
  inset: 0;
  margin: 0;
  position: absolute;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);

  &:checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  // Touch tap target ≥44px without resizing the visual control.
  @media (pointer: coarse) {
    &::before {
      block-size: max(100%, 44px);
      content: "";
      inline-size: max(100%, 44px);
      inset-block-start: 50%;
      inset-inline-start: 50%;
      position: absolute;
      transform: translate(-50%, -50%);
    }
  }
}

.ds-kit-checkbox__check {
  color: var(--color-accent-fg);
  inset-block-start: 50%;
  inset-inline-start: 50%;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, -50%);
}

.ds-kit-checkbox__input:checked + .ds-kit-checkbox__check {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-checkbox__input {
    transition: none;
  }
}
</style>
