<script setup vapor lang="ts">
import {
  DropdownMenuSeparator as RopavDropdownMenuSeparator,
  type DropdownMenuAs,
} from "ropav/dropdown-menu";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ as?: DropdownMenuAs; orientation?: "horizontal" | "vertical" }>(), {
  as: "div",
  orientation: "horizontal",
});
</script>

<template>
  <RopavDropdownMenuSeparator v-bind="$attrs" :as="as" :orientation="orientation" />
</template>
