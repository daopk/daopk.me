<script setup lang="ts">
import { EmptyState } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { FolderOpen } from "@daopk/icons";

defineProps<{
  openDisabled: boolean;
}>();

const emit = defineEmits<{
  open: [];
}>();
</script>

<template>
  <EmptyState class="editor__empty" title="No file open.">
    <Button
      variant="primary"
      :icon-start="FolderOpen"
      :disabled="openDisabled"
      @click="emit('open')"
    >
      Open
    </Button>
  </EmptyState>
</template>
