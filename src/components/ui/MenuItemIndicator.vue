<script setup vapor lang="ts">
import {
  DropdownMenuItemIndicator as RopavDropdownMenuItemIndicator,
  type DropdownMenuAs,
} from "ropav/dropdown-menu";

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{ as?: DropdownMenuAs; forceMount?: boolean }>(), {
  as: "span",
  forceMount: false,
});
</script>

<template>
  <RopavDropdownMenuItemIndicator
    v-bind="$attrs"
    data-menu-indicator
    :as="as"
    :force-mount="forceMount"
  >
    <slot />
  </RopavDropdownMenuItemIndicator>
</template>
