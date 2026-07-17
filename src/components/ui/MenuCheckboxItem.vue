<script setup vapor lang="ts">
import {
  DropdownMenuCheckboxItem as RopavDropdownMenuCheckboxItem,
  type DropdownMenuAs,
  type DropdownMenuCheckedState,
  type DropdownMenuSelectEvent,
} from "ropav/dropdown-menu";

import MenuPrimitiveSlot from "./MenuPrimitiveSlot.vue";

defineOptions({ inheritAttrs: false });

interface MenuCheckboxItemProps {
  as?: DropdownMenuAs;
  asChild?: boolean;
  closeOnSelect?: boolean;
  defaultValue?: DropdownMenuCheckedState;
  destructive?: boolean;
  disabled?: boolean;
  modelValue?: DropdownMenuCheckedState;
  textValue?: string;
}

withDefaults(defineProps<MenuCheckboxItemProps>(), {
  as: "button",
  asChild: false,
  closeOnSelect: false,
  defaultValue: false,
  destructive: false,
  disabled: false,
  modelValue: undefined,
  textValue: undefined,
});

const emit = defineEmits<{
  select: [event: Event];
  "update:modelValue": [value: DropdownMenuCheckedState];
}>();

function onSelect(event: DropdownMenuSelectEvent): void {
  emit("select", event);
}
</script>

<template>
  <RopavDropdownMenuCheckboxItem
    v-bind="$attrs"
    :as="asChild ? MenuPrimitiveSlot : as"
    :close-on-select="closeOnSelect"
    :data-text-value="textValue"
    :default-value="defaultValue"
    :destructive="destructive"
    :disabled="disabled"
    :model-value="modelValue"
    @select="onSelect"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
  </RopavDropdownMenuCheckboxItem>
</template>
