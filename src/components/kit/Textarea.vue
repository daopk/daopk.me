<script setup lang="ts">
import { computed, inject, ref } from "vue";

import { FormFieldContextKey } from "./formFieldContext";

interface TextareaProps {
  modelValue?: string;
  disabled?: boolean;
  invalid?: boolean;
  readonly?: boolean;
  resize?: "none" | "vertical";
  rows?: number;
  variant?: "default" | "plain";
  /** Explicit id; defaults to the enclosing `FormField`'s generated id. */
  id?: string;
  name?: string;
  placeholder?: string;
  autocomplete?: string;
}

const props = withDefaults(defineProps<TextareaProps>(), {
  modelValue: "",
  disabled: false,
  invalid: false,
  readonly: false,
  resize: "vertical",
  rows: 3,
  variant: "default",
  id: undefined,
  name: undefined,
  placeholder: undefined,
  autocomplete: undefined,
});

defineEmits<{
  "update:modelValue": [next: string];
}>();

const field = inject(FormFieldContextKey, null);

const resolvedId = computed(() => props.id ?? field?.controlId.value);
const describedBy = computed(() => field?.describedById.value);
const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
const isRequired = computed(() => Boolean(field?.required.value));

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function blur(): void {
  textareaRef.value?.blur();
}

function focus(options?: FocusOptions): void {
  textareaRef.value?.focus(options);
}

defineExpose({ blur, focus });
</script>

<template>
  <textarea
    :id="resolvedId"
    ref="textareaRef"
    class="ds-kit-textarea"
    :class="[
      `ds-kit-textarea--${variant}`,
      `ds-kit-textarea--resize-${resize}`,
      isInvalid && 'ds-kit-textarea--invalid',
    ]"
    :name="name"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :value="modelValue"
    :rows="rows"
    :disabled="disabled || undefined"
    :readonly="readonly || undefined"
    :aria-invalid="isInvalid || undefined"
    :aria-required="isRequired || undefined"
    :aria-describedby="describedBy"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped lang="scss">
.ds-kit-textarea {
  color: var(--color-fg);
  font: inherit;
  inline-size: 100%;
  line-height: var(--leading-relaxed);
  min-block-size: 0;
  min-inline-size: 0;
}

.ds-kit-textarea--default {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
}

.ds-kit-textarea--plain {
  background: var(--color-bg);
  border: 0;
  padding: var(--space-md);
}

.ds-kit-textarea--resize-none {
  resize: none;
}

.ds-kit-textarea--resize-vertical {
  resize: vertical;
}

.ds-kit-textarea:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.ds-kit-textarea--default:focus-visible {
  border-color: var(--color-accent);
}

.ds-kit-textarea:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-kit-textarea--invalid {
  border-color: var(--color-error-soft);
}
</style>
