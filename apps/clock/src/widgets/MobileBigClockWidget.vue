<script setup lang="ts">
import { useClockNow } from "../useClockNow";

const { minute, datetime, date } = useClockNow();
</script>

<template>
  <div class="clock-mobile-widget" role="group" aria-label="Clock">
    <div class="clock-mobile-widget__date">{{ date }}</div>
    <time class="clock-mobile-widget__time" :datetime="datetime">{{ minute }}</time>
  </div>
</template>

<style scoped lang="scss">
.clock-mobile-widget {
  align-items: flex-start;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-bg-elevated) 88%, var(--color-accent) 12%),
    color-mix(in srgb, var(--color-bg) 88%, var(--color-accent) 12%)
  );
  block-size: 100%;
  border: 1px solid color-mix(in srgb, var(--color-fg) 8%, transparent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  justify-content: space-between;
  min-block-size: 0;
  padding: 16px;
}

.clock-mobile-widget__date {
  color: color-mix(in srgb, var(--color-fg) 72%, transparent);
  font-size: 13px;
  font-weight: 600;
}

.clock-mobile-widget__time {
  font-size: clamp(48px, 18vw, 64px);
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  line-height: 1;
}
</style>
