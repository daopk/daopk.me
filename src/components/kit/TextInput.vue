<script setup lang="ts">
import { ref } from "vue";

interface TextInputProps {
  modelValue?: string;
  disabled?: boolean;
  invalid?: boolean;
  readonly?: boolean;
  type?: "text" | "search" | "email" | "password" | "url" | "number" | "date" | "time";
  variant?: "default" | "plain";
}

withDefaults(defineProps<TextInputProps>(), {
  modelValue: "",
  disabled: false,
  invalid: false,
  readonly: false,
  type: "text",
  variant: "default",
});

defineEmits<{
  "update:modelValue": [next: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

function blur(): void {
  inputRef.value?.blur();
}

function focus(options?: FocusOptions): void {
  inputRef.value?.focus(options);
}

function select(): void {
  inputRef.value?.select();
}

defineExpose({ blur, focus, select });
</script>

<template>
  <input
    ref="inputRef"
    class="ds-kit-text-input"
    :class="[`ds-kit-text-input--${variant}`, invalid && 'ds-kit-text-input--invalid']"
    :type="type"
    :value="modelValue"
    :disabled="disabled || undefined"
    :readonly="readonly || undefined"
    :aria-invalid="invalid || undefined"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped lang="scss">
.ds-kit-text-input {
  color: var(--color-fg);
  font: inherit;
  inline-size: 100%;
  min-block-size: var(--control-height-md);
  min-inline-size: 0;
}

.ds-kit-text-input--default {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-sm);
}

.ds-kit-text-input--plain {
  background: transparent;
  border: 0;
  padding: 0;
}

.ds-kit-text-input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-text-input--default:focus-visible {
  border-color: var(--color-accent);
}

.ds-kit-text-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-text-input--invalid {
  border-color: var(--color-error-soft);
}
</style>
