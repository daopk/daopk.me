<script setup vapor lang="ts">
import { EmptyState } from "@daopk/kit";
import { Button } from "@daopk/ui";
import FolderOpen from "~icons/lucide/folder-open";

defineProps<{
  openDisabled: boolean;
}>();

const emit = defineEmits<{
  open: [];
}>();
</script>

<template>
  <EmptyState class="editor__empty" title="No file open.">
    <Button variant="solid" color="blue" :disabled="openDisabled" @click="emit('open')">
      <template #left><FolderOpen aria-hidden="true" /></template>
      Open
    </Button>
  </EmptyState>
</template>
