<script setup vapor lang="ts">
import { computed, inject } from "vue";

import { radioGroupAdapterKey } from "./radioGroupContext";
import { RopavRadio } from "./ropavAdapter";

interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  /** Visible label; the `default` slot overrides it for richer content. */
  label?: string;
  id?: string;
}

const props = withDefaults(defineProps<RadioGroupItemProps>(), {
  disabled: false,
  label: undefined,
  id: undefined,
});

const injectedGroup = inject(radioGroupAdapterKey);
if (!injectedGroup) {
  throw new Error("RadioGroupItem must be used inside RadioGroup.");
}
const group = injectedGroup;

const resolvedDisabled = computed(() => props.disabled || group.disabled);

function onSelect(): void {
  group.select(props.value);
}
</script>

<template>
  <RopavRadio
    :id="id"
    class="ds-radio"
    :name="group.name"
    :value="value"
    :checked="group.modelValue === value"
    :disabled="resolvedDisabled"
    variant="outline"
    @change="onSelect"
  >
    <span v-if="label || $slots.default" class="ds-radio__label">
      <slot>{{ label }}</slot>
    </span>
  </RopavRadio>
</template>

<style scoped lang="scss">
.ds-radio {
  --_rp-radio-dot: 10px;
  --_rp-radio-font-size: var(--font-size-sm);
  --_rp-radio-size: 18px;

  color: var(--color-fg);
  gap: var(--space-sm);
  text-align: start;
}

.ds-radio:deep(.rp-radio__dot) {
  border-width: 1px;
  position: relative;

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

@media (prefers-reduced-motion: reduce) {
  .ds-radio:deep(.rp-radio__dot),
  .ds-radio:deep(.rp-radio__dot::after) {
    transition: none;
  }
}
</style>
