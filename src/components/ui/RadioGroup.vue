<script setup vapor lang="ts">
import { computed, provide, useId } from "vue";

import { radioGroupAdapterKey } from "./radioGroupContext";
import { RopavRadioGroup } from "./ropavAdapter";

interface RadioGroupProps {
  modelValue?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Accessible group label (sets `aria-label` on the radiogroup). */
  label?: string;
  name?: string;
}

const props = withDefaults(defineProps<RadioGroupProps>(), {
  modelValue: undefined,
  disabled: false,
  orientation: "vertical",
  label: undefined,
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
  get modelValue() {
    return props.modelValue;
  },
  get name() {
    return resolvedName.value;
  },
  select(value) {
    emit("update:modelValue", value);
  },
});
</script>

<template>
  <RopavRadioGroup
    class="ds-radio-group"
    :class="`ds-radio-group--${orientation}`"
    :model-value="modelValue ?? null"
    :disabled="disabled"
    :name="resolvedName"
    :aria-label="label"
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
