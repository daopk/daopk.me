<script setup lang="ts" vapor>
import { useClockNow } from "../useClockNow";

const { minute, datetime } = useClockNow();
</script>

<template>
  <time class="clock-menubar-widget" :datetime="datetime">{{ minute }}</time>
</template>

<style scoped lang="scss">
.clock-menubar-widget {
  color: var(--menubar-fg);
  font-variant-numeric: tabular-nums;
}
</style>
