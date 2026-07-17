<script setup vapor lang="ts">
import {
  DropdownMenuSubContent as RopavDropdownMenuSubContent,
  type DropdownMenuPlacement,
} from "ropav/dropdown-menu";

import { useMenuTypeahead } from "./useMenuTypeahead";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    contentClass?: string;
    placement?: DropdownMenuPlacement;
    sideOffset?: number;
  }>(),
  { contentClass: "", placement: "right-start", sideOffset: 4 },
);

const typeahead = useMenuTypeahead();
</script>

<template>
  <RopavDropdownMenuSubContent
    v-bind="$attrs"
    :class="['ds-dropdown-menu', 'ds-dropdown-menu--sub', contentClass]"
    :offset="sideOffset"
    :placement="placement"
    @keydown="typeahead.onKeydown"
  >
    <slot />
  </RopavDropdownMenuSubContent>
</template>
