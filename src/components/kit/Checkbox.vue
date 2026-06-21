<script setup lang="ts">
import { computed, inject, ref, watchEffect } from "vue";

import { Check } from "~/icons/lucide";

import { FormFieldContextKey } from "./formFieldContext";

interface CheckboxProps {
  modelValue?: boolean;
  disabled?: boolean;
  /** Renders the mixed/partial state (sets the native `indeterminate` flag). */
  indeterminate?: boolean;
  ariaLabel?: string;
  id?: string;
  name?: string;
}

const props = withDefaults(defineProps<CheckboxProps>(), {
  modelValue: false,
  disabled: false,
  indeterminate: false,
  ariaLabel: undefined,
  id: undefined,
  name: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [next: boolean];
}>();

const field = inject(FormFieldContextKey, null);

const resolvedId = computed(() => props.id ?? field?.controlId.value);
const describedBy = computed(() => field?.describedById.value);
const isInvalid = computed(() => Boolean(field?.invalid.value));
const isRequired = computed(() => Boolean(field?.required.value));

const inputRef = ref<HTMLInputElement | null>(null);

// `indeterminate` is a DOM property, not an attribute — keep it in sync after
// each render so the ref is populated on the first run.
watchEffect(
  () => {
    if (inputRef.value) {
      inputRef.value.indeterminate = props.indeterminate;
    }
  },
  { flush: "post" },
);

function focus(options?: FocusOptions): void {
  inputRef.value?.focus(options);
}

defineExpose({ focus });

function onChange(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <label class="ds-kit-checkbox" :class="{ 'ds-kit-checkbox--disabled': disabled }">
    <span class="ds-kit-checkbox__control">
      <input
        :id="resolvedId"
        ref="inputRef"
        type="checkbox"
        class="ds-kit-checkbox__input"
        :name="name"
        :checked="modelValue"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :aria-invalid="isInvalid || undefined"
        :aria-required="isRequired || undefined"
        :aria-describedby="describedBy"
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

  &:checked,
  &:indeterminate {
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
