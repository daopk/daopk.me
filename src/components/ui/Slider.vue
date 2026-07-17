<script setup vapor lang="ts">
import type { InputHTMLAttributes } from "vue";

import { RopavSlider } from "./ropavAdapter";

interface SliderProps {
  modelValue: number;
  id?: string;
  name?: string;
  min?: number;
  max?: number;
  step?: number;
  orientation?: "horizontal" | "vertical";
  thumbAlignment?: "contain" | "overflow";
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  ariaValuetext?: string;
  inputAttrs?: InputHTMLAttributes;
}

const props = withDefaults(defineProps<SliderProps>(), {
  id: undefined,
  name: undefined,
  min: 0,
  max: 100,
  step: 1,
  orientation: "horizontal",
  thumbAlignment: "overflow",
  disabled: false,
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
  ariaValuetext: undefined,
  inputAttrs: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [next: number];
  commit: [next: number];
}>();

const sliderClassNames = {
  input: "ds-slider__input",
} as const;

function clamp(n: number | undefined): number {
  if (n === undefined || Number.isNaN(n)) return props.min;
  return Math.max(props.min, Math.min(props.max, n));
}

function onUpdate(next: number): void {
  emit("update:modelValue", clamp(next));
}

function onCommit(event: Event): void {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "range") return;
  emit("commit", clamp(event.target.valueAsNumber));
}
</script>

<template>
  <div
    class="ds-slider"
    :data-disabled="disabled ? '' : undefined"
    :data-orientation="orientation"
    :data-thumb-alignment="thumbAlignment"
  >
    <RopavSlider
      :id="id"
      :name="name"
      :model-value="clamp(modelValue)"
      :min="min"
      :max="max"
      :step="step"
      :orientation="orientation"
      :disabled="disabled"
      :tooltip="false"
      :aria-label="ariaLabel ?? 'Slider thumb'"
      :labelledby="ariaLabelledby"
      :describedby="ariaDescribedby"
      :aria-value-text="ariaValuetext"
      :input-attrs="inputAttrs"
      :class-names="sliderClassNames"
      class="ds-slider__root"
      @change="onCommit"
      @update:model-value="onUpdate"
    />
  </div>
</template>

<style scoped lang="scss">
.ds-slider {
  align-items: center;
  block-size: var(--ds-slider-hit-size, 20px);
  box-sizing: border-box;
  display: flex;
  inline-size: 100%;
  min-inline-size: 0;
  padding-inline: calc(var(--ds-slider-thumb-size, 16px) / 2);
  position: relative;
  touch-action: none;
  user-select: none;

  &[data-disabled] {
    opacity: 0.6;
  }
}

.ds-slider[data-orientation="vertical"] {
  block-size: 100%;
  inline-size: var(--ds-slider-hit-size, 20px);
  min-block-size: 0;
  min-inline-size: var(--ds-slider-hit-size, 20px);
  padding-block: calc(var(--ds-slider-thumb-size, 16px) / 2);
  padding-inline: 0;
}

.ds-slider__root {
  --rp-color-control-selected-bg: var(--color-accent);
  --rp-color-control-thumb-bg: var(--color-accent);
  --rp-color-control-track-bg: var(--color-bg-subtle);
  --rp-slider-thumb-border-width: 0;
  --rp-slider-thumb-size: var(--ds-slider-thumb-size, 16px);
  --rp-slider-track-length: 100%;
  --rp-slider-track-thickness: 3px;

  align-content: center;
  block-size: 100%;
  flex: 1 1 auto;
  gap: 0;
  min-inline-size: 0;
}

.ds-slider[data-orientation="vertical"] .ds-slider__root {
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
  min-inline-size: 0;
}

.ds-slider__root:deep(.ds-slider__input::-webkit-slider-thumb),
.ds-slider__root:deep(.ds-slider__input::-moz-range-thumb) {
  opacity: var(--ds-slider-thumb-opacity, 1);
}

@media (prefers-reduced-motion: reduce) {
  .ds-slider__root {
    --rp-transition-fast: none;
  }
}
</style>
