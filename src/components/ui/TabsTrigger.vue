<script setup vapor lang="ts">
import { RopavTabsTrigger } from "./ropavAdapter";
import type { TabsTriggerAlign, TabsValue } from "./tabsTypes";

defineOptions({ inheritAttrs: false });

interface TabsTriggerProps {
  value: TabsValue;
  id?: string;
  disabled?: boolean;
  align?: TabsTriggerAlign;
}

withDefaults(defineProps<TabsTriggerProps>(), {
  id: undefined,
  disabled: false,
  align: undefined,
});
</script>

<template>
  <RopavTabsTrigger
    v-bind="$attrs"
    class="ds-tabs-trigger"
    :id="id"
    :value="value"
    :disabled="disabled"
    :align="align"
  >
    <slot />
  </RopavTabsTrigger>
</template>

<style scoped lang="scss">
.ds-tabs-trigger[data-variant="pills"] {
  color: var(--color-fg-muted);
}

.ds-tabs-trigger[data-variant="pills"]:hover:not(:disabled),
.ds-tabs-trigger[data-variant="pills"][data-state="active"] {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.ds-tabs-trigger[data-variant="pills"][data-state="active"] {
  box-shadow: var(--shadow-sm);
}

@media (prefers-reduced-motion: reduce) {
  .ds-tabs-trigger {
    --rp-transition-fast: none;
  }
}
</style>
