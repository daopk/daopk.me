<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";

interface SwitchProps {
  modelValue: boolean;
  disabled?: boolean;
}

withDefaults(defineProps<SwitchProps>(), {
  disabled: false,
});

defineEmits<{
  "update:modelValue": [next: boolean];
}>();
</script>

<template>
  <SwitchRoot
    :model-value="modelValue"
    :disabled="disabled"
    class="ds-switch"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <SwitchThumb class="ds-switch__thumb" />
  </SwitchRoot>
</template>

<style scoped lang="scss">
.ds-switch {
  background: var(--color-bg);
  block-size: 22px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  display: inline-block;
  flex: 0 0 auto;
  inline-size: 36px;
  padding: 0;
  position: relative;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease);

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  &[data-state="checked"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  &[data-disabled] {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.ds-switch__thumb {
  background: var(--color-bg-elevated);
  block-size: 18px;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  display: block;
  inline-size: 18px;
  inset-block-start: 1px;
  inset-inline-start: 1px;
  position: absolute;
  transition: inset-inline-start var(--duration-fast) var(--ease);
}

.ds-switch[data-state="checked"] .ds-switch__thumb {
  inset-inline-start: 15px;
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
  .ds-switch,
  .ds-switch__thumb {
    transition: none;
  }
}
</style>
