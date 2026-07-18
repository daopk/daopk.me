<script setup vapor lang="ts">
import type { VaporComponent } from "vue";

import { AppToolbar } from "@daopk/kit";
import ArrowLeft from "~icons/lucide/arrow-left";
import { Icon, Button, IconButton } from "@daopk/ui";

defineProps<{
  readonly shareButtonIcon: VaporComponent;
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
    <Button class="blog__back" size="sm" @click="$emit('back')">
      <template #left><Icon :icon="ArrowLeft" size="14" aria-hidden="true" /></template>
      All posts
    </Button>
    <template #end>
      <span class="blog__share-status" role="status" aria-live="polite" aria-atomic="true">
        {{ shareCopied ? "Copied" : "" }}
      </span>
      <IconButton
        class="blog__share"
        :ariaLabel="shareButtonLabel"
        size="sm"
        @click="$emit('share')"
      >
        <component :is="shareButtonIcon" aria-hidden="true" />
      </IconButton>
    </template>
  </AppToolbar>
</template>
