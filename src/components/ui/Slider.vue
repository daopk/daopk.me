<script setup lang="ts">
import { computed } from "vue";
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from "reka-ui";

interface SliderProps {
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaValuetext?: string;
}

const props = withDefaults(defineProps<SliderProps>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaValuetext: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [next: number];
  commit: [next: number];
}>();

function clamp(n: number | undefined): number {
  if (n === undefined || Number.isNaN(n)) return props.min;
  return Math.max(props.min, Math.min(props.max, n));
}

const internalValue = computed<number[]>({
  get: () => [clamp(props.modelValue)],
  set: (next) => emit("update:modelValue", clamp(next[0])),
});

function onCommit(next: number[]): void {
  emit("commit", clamp(next[0]));
}
</script>

<template>
  <SliderRoot
    v-model="internalValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    class="ds-slider"
    @value-commit="onCommit"
  >
    <SliderTrack class="ds-slider__track">
      <SliderRange class="ds-slider__range" />
    </SliderTrack>
    <!-- ARIA forwarding lives on SliderThumb, not SliderRoot. reka-ui's
         SliderThumbImpl computes aria-valuenow/min/max + aria-orientation
         on the thumb element but does NOT bubble extra aria-* down from
         SliderRoot. Anything we want screen readers to read off the
         slider role (labelledby, valuetext) must be bound here. -->
    <SliderThumb
      class="ds-slider__thumb"
      :aria-label="ariaLabel ?? 'Slider thumb'"
      :aria-labelledby="ariaLabelledby"
      :aria-valuetext="ariaValuetext"
    />
  </SliderRoot>
</template>

<style scoped lang="scss">
.ds-slider {
  align-items: center;
  block-size: 20px;
  display: flex;
  inline-size: 100%;
  position: relative;
  touch-action: none;
  user-select: none;

  &[data-disabled] {
    opacity: 0.6;
  }
}

.ds-slider__track {
  background-color: var(--color-bg-subtle);
  block-size: 3px;
  border-radius: var(--radius-full);
  flex-grow: 1;
  position: relative;
}

.ds-slider__range {
  background-color: var(--color-accent);
  block-size: 100%;
  border-radius: var(--radius-full);
  position: absolute;
}

.ds-slider__thumb {
  background-color: var(--color-accent);
  block-size: 16px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  display: block;
  inline-size: 16px;
  transition: box-shadow var(--duration-fast) var(--ease);

  &:hover {
    box-shadow: var(--shadow-md);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-slider__thumb {
    transition: none;
  }
}
</style>
