<script setup vapor lang="ts">
import { computed, onMounted, onUpdated, useId } from "vue";
import {
  TabsContent as RopavTabsContent,
  type TabsContentProps as RopavTabsContentProps,
} from "ropav/tabs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<RopavTabsContentProps & { tabIndex?: number }>(), {
  tabIndex: 0,
});
const generatedId = useId();
const resolvedId = computed(() => props.id ?? `${generatedId}-tabpanel`);

function syncTabIndex(): void {
  const panel = document.getElementById(resolvedId.value);
  if (panel?.getAttribute("role") === "tabpanel") {
    panel.tabIndex = props.tabIndex;
  }
}

onMounted(syncTabIndex);
onUpdated(syncTabIndex);
</script>

<template>
  <RopavTabsContent
    v-bind="$attrs"
    :id="resolvedId"
    :value="props.value"
    :unmount-on-exit="props.unmountOnExit"
    :aria-label="props.ariaLabel"
    :aria-describedby="props.ariaDescribedby"
    :aria-labelledby="props.ariaLabelledby"
    :class-names="props.classNames"
    :styles="props.styles"
  >
    <slot />
  </RopavTabsContent>
</template>
