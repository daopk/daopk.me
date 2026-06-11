<script setup lang="ts">
import { ScrollArea, Spinner } from "@daopk/kit";

defineProps<{
  html: string;
  loading: boolean;
  message: string;
}>();
</script>

<template>
  <ScrollArea as="aside" class="editor__preview">
    <div v-if="loading" class="editor__preview-message">
      <Spinner size="sm" />
      <span>Rendering preview...</span>
    </div>
    <div v-else-if="message" class="editor__preview-message">{{ message }}</div>
    <div v-else class="editor__preview-content" v-html="html" />
  </ScrollArea>
</template>
