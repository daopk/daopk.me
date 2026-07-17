<script setup vapor lang="ts">
import {
  DropdownMenuRadioGroup as RopavDropdownMenuRadioGroup,
  type DropdownMenuAs,
  type DropdownMenuItemValue,
} from "ropav/dropdown-menu";

defineOptions({ inheritAttrs: false });

interface MenuRadioGroupProps {
  as?: DropdownMenuAs;
  modelValue: string;
}

withDefaults(defineProps<MenuRadioGroupProps>(), { as: "div" });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

function onUpdate(value: DropdownMenuItemValue): void {
  emit("update:modelValue", String(value));
}
</script>

<template>
  <RopavDropdownMenuRadioGroup
    v-bind="$attrs"
    :as="as"
    :model-value="modelValue"
    @update:model-value="onUpdate"
  >
    <slot />
  </RopavDropdownMenuRadioGroup>
</template>
