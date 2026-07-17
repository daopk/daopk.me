<script setup vapor lang="ts">
import {
  DropdownMenuSubTrigger as RopavDropdownMenuSubTrigger,
  type DropdownMenuAs,
} from "ropav/dropdown-menu";

import MenuPrimitiveSlot from "./MenuPrimitiveSlot.vue";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    as?: DropdownMenuAs;
    asChild?: boolean;
    disabled?: boolean;
    textValue?: string;
  }>(),
  { as: "button", asChild: false, disabled: false, textValue: undefined },
);
</script>

<template>
  <RopavDropdownMenuSubTrigger
    v-bind="$attrs"
    :as="asChild ? MenuPrimitiveSlot : as"
    :data-text-value="textValue"
    :disabled="disabled"
  >
    <slot />
  </RopavDropdownMenuSubTrigger>
</template>
