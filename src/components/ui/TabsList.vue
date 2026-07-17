<script setup vapor lang="ts">
import { RopavTabsList } from "./ropavAdapter";

defineOptions({ inheritAttrs: false });

interface TabsListProps {
  id?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
}

withDefaults(defineProps<TabsListProps>(), {
  id: undefined,
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
});
</script>

<template>
  <RopavTabsList
    v-bind="$attrs"
    class="ds-tabs-list"
    :id="id"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledby"
    :aria-describedby="ariaDescribedby"
  >
    <slot />
  </RopavTabsList>
</template>

<style scoped lang="scss">
.ds-tabs-list[data-variant="pills"] {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  gap: var(--space-2xs);
  inline-size: fit-content;
  padding: var(--space-2xs);
}
</style>
