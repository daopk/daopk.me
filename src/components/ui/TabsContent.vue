<script setup vapor lang="ts">
import { RopavTabsContent } from "./ropavAdapter";
import type { TabsValue } from "./tabsTypes";

defineOptions({ inheritAttrs: false });

interface TabsContentProps {
  value: TabsValue;
  id?: string;
  unmountOnExit?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
}

withDefaults(defineProps<TabsContentProps>(), {
  id: undefined,
  unmountOnExit: undefined,
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
});
</script>

<template>
  <RopavTabsContent
    v-bind="$attrs"
    class="ds-tabs-content"
    :id="id"
    :value="value"
    :unmount-on-exit="unmountOnExit"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledby"
    :aria-describedby="ariaDescribedby"
  >
    <slot />
  </RopavTabsContent>
</template>

<style scoped lang="scss">
.ds-tabs-content {
  min-block-size: 0;
  min-inline-size: 0;
}

// Consumer layout rules (for example `display: grid`) must not override the
// visibility state owned by Ropav's `hidden` attribute.
.ds-tabs-content[hidden] {
  display: none;
}
</style>
