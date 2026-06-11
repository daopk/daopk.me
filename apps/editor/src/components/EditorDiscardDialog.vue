<script setup lang="ts">
import { computed } from "vue";

import { Button, Dialog, DialogActions } from "@daopk/ui";

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
  <Dialog
    v-model:open="dialogOpen"
    title="Discard changes?"
    description="Unsaved changes in the current file will be lost."
    @close="emit('cancel')"
  >
    <DialogActions>
      <Button size="sm" @click="emit('cancel')">Cancel</Button>
      <Button size="sm" variant="danger" @click="emit('confirm')">Discard</Button>
    </DialogActions>
  </Dialog>
</template>
