<script setup vapor lang="ts">
import { computed } from "vue";

interface ProgressProps {
  /** Current value. `null`/`undefined` renders the indeterminate animation. */
  value?: number | null;
  /** Upper bound for `value` (defaults to 100). */
  max?: number;
  /** Accessible label for the progress bar. */
  label?: string;
  size?: "sm" | "md";
}

const props = withDefaults(defineProps<ProgressProps>(), {
  value: null,
  max: 100,
  label: undefined,
  size: "md",
});

const indeterminate = computed(() => props.value === null || props.value === undefined);

const clamped = computed(() => {
  if (indeterminate.value) {
    return 0;
  }
  return Math.min(props.max, Math.max(0, props.value as number));
});

const percent = computed(() => (props.max <= 0 ? 0 : (clamped.value / props.max) * 100));
</script>

<template>
  <div
    class="ds-kit-progress"
    :class="[`ds-kit-progress--${size}`, indeterminate && 'ds-kit-progress--indeterminate']"
    role="progressbar"
    :aria-label="label"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="indeterminate ? undefined : clamped"
  >
    <div
      class="ds-kit-progress__indicator"
      :style="indeterminate ? undefined : { inlineSize: `${percent}%` }"
    />
  </div>
</template>

<style scoped lang="scss">
.ds-kit-progress {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-full);
  inline-size: 100%;
  overflow: hidden;
  position: relative;
}

.ds-kit-progress--sm {
  block-size: 4px;
}

.ds-kit-progress--md {
  block-size: 8px;
}

.ds-kit-progress__indicator {
  background: var(--color-accent);
  block-size: 100%;
  border-radius: inherit;
  inline-size: 0;
  transition: inline-size var(--duration-base) var(--ease);
}

.ds-kit-progress--indeterminate .ds-kit-progress__indicator {
  animation: ds-kit-progress-indeterminate 1.1s var(--ease) infinite;
  inline-size: 40%;
}

@keyframes ds-kit-progress-indeterminate {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(310%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-kit-progress__indicator {
    transition: none;
  }

  .ds-kit-progress--indeterminate .ds-kit-progress__indicator {
    animation-duration: 2.4s;
  }
}
</style>
