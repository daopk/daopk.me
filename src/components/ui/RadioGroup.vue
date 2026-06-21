<script setup lang="ts">
import { RadioGroupRoot } from "reka-ui";

interface RadioGroupProps {
  modelValue?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Accessible group label (sets `aria-label` on the radiogroup). */
  label?: string;
  name?: string;
}

withDefaults(defineProps<RadioGroupProps>(), {
  modelValue: undefined,
  disabled: false,
  orientation: "vertical",
  label: undefined,
  name: undefined,
});

defineEmits<{
  "update:modelValue": [next: string];
}>();
</script>

<template>
  <RadioGroupRoot
    class="ds-radio-group"
    :class="`ds-radio-group--${orientation}`"
    :model-value="modelValue"
    :disabled="disabled"
    :orientation="orientation"
    :name="name"
    :aria-label="label"
    @update:model-value="$emit('update:modelValue', String($event))"
  >
    <slot />
  </RadioGroupRoot>
</template>

<style scoped lang="scss">
.ds-radio-group {
  display: flex;
  gap: var(--space-sm);
}

.ds-radio-group--vertical {
  flex-direction: column;
}

.ds-radio-group--horizontal {
  align-items: center;
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--space-lg);
}
</style>
