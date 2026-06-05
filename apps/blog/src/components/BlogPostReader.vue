<script setup lang="ts">
import { EmptyState, StatusBanner } from "@daopk/kit";

import type { BlogIndexPost } from "../composables/useBlogIndex";
import type { BlogPostStatus } from "../composables/useBlogPost";

type BlogPostCover = NonNullable<BlogIndexPost["thumbnail"]>;

defineProps<{
  readonly cover: BlogPostCover | null;
  readonly html: string;
  readonly loadFailed: boolean;
  readonly notFound: boolean;
  readonly notFoundDescription: string;
  readonly status: BlogPostStatus;
}>();

defineEmits<{
  "content-click": [event: MouseEvent];
}>();
</script>

<template>
  <div class="blog__post-shell">
    <div v-if="cover" class="blog__post-cover">
      <img
        class="blog__post-cover-image"
        :src="cover.url"
        :alt="cover.alt"
        :width="cover.width"
        :height="cover.height"
        decoding="async"
      />
    </div>
    <div
      v-if="html"
      class="blog__content"
      @click.capture="$emit('content-click', $event)"
      v-html="html"
    />
    <StatusBanner v-else-if="status === 'loading'" class="blog__status" aria-live="polite">
      Loading post...
    </StatusBanner>
    <EmptyState
      v-else-if="notFound"
      class="blog__state"
      aria-live="polite"
      title="Post not found"
      :description="notFoundDescription"
    />
    <StatusBanner v-else-if="loadFailed" class="blog__error" tone="error">
      Could not load blog post.
    </StatusBanner>
  </div>
</template>
