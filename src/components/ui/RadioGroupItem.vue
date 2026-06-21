<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem as RekaRadioGroupItem } from "reka-ui";

interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  /** Visible label; the `default` slot overrides it for richer content. */
  label?: string;
  id?: string;
}

withDefaults(defineProps<RadioGroupItemProps>(), {
  disabled: false,
  label: undefined,
  id: undefined,
});
</script>

<template>
  <RekaRadioGroupItem :id="id" class="ds-radio" :value="value" :disabled="disabled">
    <span class="ds-radio__control">
      <RadioGroupIndicator class="ds-radio__indicator" />
    </span>
    <span v-if="label || $slots.default" class="ds-radio__label">
      <slot>{{ label }}</slot>
    </span>
  </RekaRadioGroupItem>
</template>

<style scoped lang="scss">
.ds-radio {
  align-items: center;
  background: transparent;
  border: 0;
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: var(--font-size-sm);
  gap: var(--space-sm);
  padding: 0;
  text-align: start;

  &[data-disabled] {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
  }
}

.ds-radio__control {
  align-items: center;
  background: var(--color-bg-elevated);
  block-size: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  display: inline-flex;
  flex: 0 0 auto;
  inline-size: 18px;
  justify-content: center;
  position: relative;
  transition: border-color var(--duration-fast) var(--ease);

  .ds-radio[data-state="checked"] & {
    border-color: var(--color-accent);
  }

  .ds-radio:focus-visible & {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

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

.ds-radio__indicator {
  align-items: center;
  block-size: 100%;
  display: inline-flex;
  inline-size: 100%;
  justify-content: center;

  &::after {
    background: var(--color-accent);
    block-size: 10px;
    border-radius: var(--radius-full);
    content: "";
    inline-size: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-radio__control {
    transition: none;
  }
}
</style>
