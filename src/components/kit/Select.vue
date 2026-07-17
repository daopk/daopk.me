<script setup vapor lang="ts">
import { computed, inject, ref } from "vue";

import { FormFieldContextKey } from "./formFieldContext";
import type { SelectOption } from "./types";

interface SelectProps {
  modelValue: string;
  options: readonly SelectOption[];
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** Explicit id; defaults to the enclosing `FormField`'s generated id. */
  id?: string;
  name?: string;
}

const props = withDefaults(defineProps<SelectProps>(), {
  disabled: false,
  invalid: false,
  placeholder: undefined,
  id: undefined,
  name: undefined,
});

defineEmits<{
  "update:modelValue": [next: string];
}>();

const field = inject(FormFieldContextKey, null);

const resolvedId = computed(() => props.id ?? field?.controlId.value);
const describedBy = computed(() => field?.describedById.value);
const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
const isRequired = computed(() => Boolean(field?.required.value));

const selectRef = ref<HTMLSelectElement | null>(null);

function blur(): void {
  selectRef.value?.blur();
}

function focus(options?: FocusOptions): void {
  selectRef.value?.focus(options);
}

defineExpose({ blur, focus });
</script>

<template>
  <select
    :id="resolvedId"
    ref="selectRef"
    class="ds-kit-select"
    :class="{ 'ds-kit-select--invalid': isInvalid }"
    :name="name"
    :value="modelValue"
    :disabled="disabled || undefined"
    :aria-invalid="isInvalid || undefined"
    :aria-required="isRequired || undefined"
    :aria-describedby="describedBy"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled || undefined"
    >
      {{ option.label }}
    </option>
  </select>
</template>

<style scoped lang="scss">
.ds-kit-select {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  font: inherit;
  inline-size: 100%;
  min-block-size: var(--control-height-md);
  min-inline-size: 0;
  padding: 0 var(--space-sm);
}

.ds-kit-select:focus-visible {
  border-color: var(--color-accent);
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-select--invalid {
  border-color: var(--color-error-soft);
}
</style>
