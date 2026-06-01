<script setup lang="ts">
import { useClockNow } from "../useClockNow";

const { minute, datetime, date } = useClockNow();
</script>

<template>
  <div class="clock-desktop-widget" role="group" aria-label="Clock">
    <time class="clock-desktop-widget__time" :datetime="datetime">{{ minute }}</time>
    <div class="clock-desktop-widget__date">{{ date }}</div>
  </div>
</template>

<style scoped lang="scss">
.clock-desktop-widget {
  align-items: flex-start;
  backdrop-filter: blur(var(--blur-md, 12px));
  background: color-mix(in srgb, var(--color-bg) 60%, transparent);
  block-size: 100%;
  border: 1px solid color-mix(in srgb, var(--color-fg) 8%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 4px);
  inline-size: 100%;
  justify-content: center;
  padding: var(--space-3, 8px) var(--space-4, 12px);
}

.clock-desktop-widget__time {
  font-size: clamp(28px, 4vw, 36px);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
}

.clock-desktop-widget__date {
  color: color-mix(in srgb, var(--color-fg) 65%, transparent);
  font-size: var(--font-size-sm, 12px);
  font-weight: 500;
}
</style>
