<script setup lang="ts">
import { Button, Dialog } from "@daopk/ui";

defineProps<{
  readonly description: string;
  readonly loading: boolean;
  readonly open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <Dialog
    :open="open"
    title="Move item to Trash?"
    :description="description"
    @close="emit('cancel')"
  >
    <div class="finder__dialog-actions">
      <Button size="sm" :disabled="loading" @click="emit('cancel')">Cancel</Button>
      <Button size="sm" variant="primary" :loading="loading" @click="emit('confirm')">
        Move to Trash
      </Button>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.finder__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
</style>
