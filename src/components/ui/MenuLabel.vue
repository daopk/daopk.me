<script setup vapor lang="ts">
import {
  DropdownMenuLabel as RopavDropdownMenuLabel,
  type DropdownMenuAs,
} from "ropav/dropdown-menu";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ as?: DropdownMenuAs }>(), { as: "div" });
</script>

<template>
  <RopavDropdownMenuLabel v-bind="$attrs" :as="as"><slot /></RopavDropdownMenuLabel>
</template>
