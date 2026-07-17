<script setup vapor lang="ts">
import { computed } from "vue";

import { Button, Modal } from "@daopk/ui";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
  "update:open": [open: boolean];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (open: boolean) => {
    emit("update:open", open);
  },
});
</script>

<template>
  <Modal
    v-model:open="dialogOpen"
    title="Discard changes?"
    description="Unsaved changes in the current file will be lost."
    :show-close-button="false"
    @close="emit('cancel')"
  >
    <template #footer>
      <Button size="sm" @click="emit('cancel')">Cancel</Button>
      <Button size="sm" variant="solid" color="red" @click="emit('confirm')">Discard</Button>
    </template>
  </Modal>
</template>
