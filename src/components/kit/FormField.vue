<script setup vapor lang="ts">
import { computed, provide, useId } from "vue";

import { FormFieldContextKey } from "./formFieldContext";

interface FormFieldProps {
  /** Visible field label, rendered above the control. */
  label?: string;
  /** Explicit control id. Defaults to an auto-generated id wired to the slot control. */
  for?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Error text; replaces the hint and is announced via `role="alert"`. */
  error?: string;
  /** Marks the field required (adds the visual `*` and `aria-required`). */
  required?: boolean;
}

const props = withDefaults(defineProps<FormFieldProps>(), {
  label: undefined,
  for: undefined,
  hint: undefined,
  error: undefined,
  required: false,
});

const generatedId = useId();
const messageId = useId();

const controlId = computed(() => props.for ?? generatedId);
const invalid = computed(() => Boolean(props.error));
const required = computed(() => props.required);
const describedById = computed(() => (props.error || props.hint ? messageId : undefined));

provide(FormFieldContextKey, { controlId, describedById, invalid, required });
</script>

<template>
  <label class="ds-kit-form-field" :for="controlId">
    <span v-if="label" class="ds-kit-form-field__label">
      <span>{{ label }}</span>
      <span v-if="required" aria-hidden="true">*</span>
    </span>
    <slot />
    <span
      v-if="error"
      :id="messageId"
      class="ds-kit-form-field__message ds-kit-form-field__message--error"
      role="alert"
      aria-live="assertive"
    >
      {{ error }}
    </span>
    <span v-else-if="hint" :id="messageId" class="ds-kit-form-field__message">
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
