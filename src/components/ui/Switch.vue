<script setup vapor lang="ts">
import { computed, useAttrs, type InputHTMLAttributes } from "vue";

import { RopavSwitch } from "./ropavAdapter";

defineOptions({ inheritAttrs: false });

interface SwitchProps {
  modelValue: boolean;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  inputAttrs?: InputHTMLAttributes;
}

const props = withDefaults(defineProps<SwitchProps>(), {
  id: undefined,
  name: undefined,
  disabled: false,
  required: false,
  invalid: false,
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
  inputAttrs: undefined,
});

const attrs = useAttrs();
const switchClassNames = {
  thumb: "ds-switch__thumb",
  track: "ds-switch__track",
} as const;
const resolvedAriaLabel = computed(() => props.ariaLabel ?? stringAttr(attrs["aria-label"]));
const resolvedAriaLabelledby = computed(
  () => props.ariaLabelledby ?? stringAttr(attrs["aria-labelledby"]),
);
const resolvedAriaDescribedby = computed(
  () => props.ariaDescribedby ?? stringAttr(attrs["aria-describedby"]),
);

function stringAttr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

defineEmits<{
  "update:modelValue": [next: boolean];
}>();
</script>

<template>
  <RopavSwitch
    v-bind="attrs"
    :id="id"
    :name="name"
    :model-value="modelValue"
    :disabled="disabled"
    :required="required"
    :invalid="invalid"
    :aria-label="resolvedAriaLabel"
    :labelledby="resolvedAriaLabelledby"
    :describedby="resolvedAriaDescribedby"
    :input-attrs="inputAttrs"
    :class-names="switchClassNames"
    class="ds-switch"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<style scoped lang="scss">
.ds-switch {
  --rp-color-control-track-bg: var(--color-bg);
  --rp-switch-thumb-offset: 1px;
  --rp-switch-thumb-size: 18px;
  --rp-switch-track-height: 22px;
  --rp-switch-track-width: 36px;

  flex: 0 0 auto;
  position: relative;
}

.ds-switch:deep(.ds-switch__track) {
  border: 1px solid var(--color-border);
  box-sizing: border-box;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);
}

.ds-switch[data-state="checked"]:deep(.ds-switch__track) {
  border-color: var(--color-accent);
}

/* Expand the tap target to the ~44px native floor on touch without changing
   the switch's visual size. The pseudo belongs to the SwitchRoot, so a tap
   anywhere inside it still toggles. */
@media (pointer: coarse) {
  .ds-switch::before {
    block-size: max(100%, 44px);
    content: "";
    inline-size: max(100%, 44px);
    inset-block-start: 50%;
    inset-inline-start: 50%;
    position: absolute;
    transform: translate(-50%, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-switch {
    --rp-transition-fast: none;
  }
}
</style>
