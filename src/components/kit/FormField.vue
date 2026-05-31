<script setup lang="ts">
interface FormFieldProps {
  label?: string;
  for?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

const props = withDefaults(defineProps<FormFieldProps>(), {
  label: undefined,
  for: undefined,
  hint: undefined,
  error: undefined,
  required: false,
});
</script>

<template>
  <label class="ds-kit-form-field" :for="props.for">
    <span v-if="label" class="ds-kit-form-field__label">
      <span>{{ label }}</span>
      <span v-if="required" aria-hidden="true">*</span>
    </span>
    <slot />
    <span v-if="error" class="ds-kit-form-field__message ds-kit-form-field__message--error">
      {{ error }}
    </span>
    <span v-else-if="hint" class="ds-kit-form-field__message">
      {{ hint }}
    </span>
  </label>
</template>

<style scoped lang="scss">
.ds-kit-form-field {
  color: var(--color-fg);
  display: grid;
  gap: var(--space-xs);
}

.ds-kit-form-field__label {
  align-items: center;
  color: var(--color-fg-muted);
  display: inline-flex;
  font-size: var(--font-size-xs);
  gap: var(--space-2xs);
}

.ds-kit-form-field__message {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  line-height: var(--leading-snug);
}

.ds-kit-form-field__message--error {
  color: var(--color-error-soft);
}
</style>
