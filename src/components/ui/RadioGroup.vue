<script setup vapor lang="ts">
import { computed, provide, useId } from "vue";

import { radioGroupAdapterKey } from "./radioGroupContext";
import { RopavRadioGroup } from "./ropavAdapter";

interface RadioGroupProps {
  modelValue?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Accessible group label (sets `aria-label` on the radiogroup). */
  label?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  name?: string;
}

const props = withDefaults(defineProps<RadioGroupProps>(), {
  modelValue: undefined,
  id: undefined,
  disabled: false,
  required: false,
  invalid: false,
  orientation: "vertical",
  label: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
  name: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [next: string];
}>();

const generatedName = useId();
const resolvedName = computed(() => props.name ?? `${generatedName}-radio`);

provide(radioGroupAdapterKey, {
  get disabled() {
    return props.disabled;
  },
  get invalid() {
    return props.invalid;
  },
  get modelValue() {
    return props.modelValue;
  },
  get name() {
    return resolvedName.value;
  },
  get required() {
    return props.required;
  },
  select(value) {
    emit("update:modelValue", value);
  },
});
</script>

<template>
  <RopavRadioGroup
    :id="id"
    class="ds-radio-group"
    :class="`ds-radio-group--${orientation}`"
    :model-value="modelValue ?? null"
    :disabled="disabled"
    :required="required"
    :invalid="invalid"
    :orientation="orientation"
    :name="resolvedName"
    :aria-label="label"
    :labelledby="ariaLabelledby"
    :describedby="ariaDescribedby"
  >
    <slot />
  </RopavRadioGroup>
</template>

<style scoped lang="scss">
.ds-radio-group {
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
