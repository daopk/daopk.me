<script setup vapor lang="ts">
import type { Component } from "vue";

import { AppToolbar, IconButton } from "@daopk/kit";
import { ArrowLeft } from "@daopk/icons";
import { Button } from "@daopk/ui";

defineProps<{
  readonly shareButtonIcon: Component;
  readonly shareButtonLabel: string;
  readonly shareCopied: boolean;
}>();

defineEmits<{
  back: [];
  share: [];
}>();
</script>

<template>
  <AppToolbar class="blog__post-toolbar" density="comfortable" wrap>
    <Button class="blog__back" size="sm" :icon-start="ArrowLeft" @click="$emit('back')">
      All posts
    </Button>
    <template #end>
      <span class="blog__share-status" role="status" aria-live="polite" aria-atomic="true">
        {{ shareCopied ? "Copied" : "" }}
      </span>
      <IconButton
        class="blog__share"
        :icon="shareButtonIcon"
        :label="shareButtonLabel"
        size="sm"
        @click="$emit('share')"
      />
    </template>
  </AppToolbar>
</template>
