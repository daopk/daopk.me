<script setup vapor lang="ts">
import {
  DropdownMenuItem as RopavDropdownMenuItem,
  type DropdownMenuAs,
  type DropdownMenuItemValue,
  type DropdownMenuSelectEvent,
} from "ropav/dropdown-menu";

import MenuPrimitiveSlot from "./MenuPrimitiveSlot.vue";

defineOptions({ inheritAttrs: false });

interface MenuItemProps {
  as?: DropdownMenuAs;
  asChild?: boolean;
  closeOnSelect?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  textValue?: string;
  value?: DropdownMenuItemValue;
}

const props = withDefaults(defineProps<MenuItemProps>(), {
  as: "button",
  asChild: false,
  closeOnSelect: true,
  destructive: false,
  disabled: false,
  textValue: undefined,
  value: undefined,
});

const emit = defineEmits<{ select: [event: Event] }>();

function onSelect(event: DropdownMenuSelectEvent): void {
  emit("select", event);
}
</script>

<template>
  <RopavDropdownMenuItem
    v-bind="$attrs"
    :as="asChild ? MenuPrimitiveSlot : as"
    :close-on-select="closeOnSelect"
    :data-text-value="textValue"
    :destructive="destructive"
    :disabled="disabled"
    :value="value"
    @select="onSelect"
  >
    <slot />
  </RopavDropdownMenuItem>
</template>
