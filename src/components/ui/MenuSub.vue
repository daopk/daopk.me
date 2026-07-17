<script setup vapor lang="ts">
import { DropdownMenuSub as RopavDropdownMenuSub } from "ropav/dropdown-menu";

withDefaults(defineProps<{ defaultOpen?: boolean; open?: boolean }>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{ "update:open": [value: boolean] }>();
</script>

<template>
  <RopavDropdownMenuSub
    :default-open="defaultOpen"
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <slot />
  </RopavDropdownMenuSub>
</template>
