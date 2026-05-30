<script setup lang="ts">
interface TextareaProps {
  modelValue?: string;
  disabled?: boolean;
  invalid?: boolean;
  readonly?: boolean;
  resize?: "none" | "vertical";
  rows?: number;
  variant?: "default" | "plain";
}

withDefaults(defineProps<TextareaProps>(), {
  modelValue: "",
  disabled: false,
  invalid: false,
  readonly: false,
  resize: "vertical",
  rows: 3,
  variant: "default",
});

defineEmits<{
  "update:modelValue": [next: string];
}>();
</script>

<template>
  <textarea
    class="ds-kit-textarea"
    :class="[
      `ds-kit-textarea--${variant}`,
      `ds-kit-textarea--resize-${resize}`,
      invalid && 'ds-kit-textarea--invalid',
    ]"
    :value="modelValue"
    :rows="rows"
    :disabled="disabled || undefined"
    :readonly="readonly || undefined"
    :aria-invalid="invalid || undefined"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped lang="scss">
.ds-kit-textarea {
  color: var(--color-fg);
  font: inherit;
  inline-size: 100%;
  line-height: 1.6;
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
