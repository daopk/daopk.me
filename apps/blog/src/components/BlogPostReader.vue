<script setup lang="ts">
import { EmptyState, StatusBanner } from "@daopk/kit";
import { PreviewHost } from "@daopk/kit";
import type { AppPreviewInput } from "@daopk/sdk";

import type { BlogIndexPost } from "../composables/useBlogIndex";
import type { BlogPostContentBlock, BlogPostStatus } from "../composables/useBlogPost";

type BlogPostCover = NonNullable<BlogIndexPost["thumbnail"]>;

defineProps<{
  readonly cover: BlogPostCover | null;
  readonly contentBlocks: readonly BlogPostContentBlock[];
  readonly loadFailed: boolean;
  readonly notFound: boolean;
  readonly notFoundDescription: string;
  readonly status: BlogPostStatus;
}>();

defineEmits<{
  "content-click": [event: MouseEvent];
}>();

function previewInput(url: string): AppPreviewInput {
  return { kind: "url", url };
}
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
      v-if="contentBlocks.length > 0"
      class="blog__content"
      @click.capture="$emit('content-click', $event)"
    >
      <template v-for="(block, index) in contentBlocks" :key="index">
        <div v-if="block.kind === 'html'" class="blog__content-html" v-html="block.html" />
        <PreviewHost
          v-else
          :input="previewInput(block.request.url)"
          surface="blog.embed"
          fallback-title="Preview unavailable"
          fallback-description="No app can preview this link yet."
        />
      </template>
    </div>
    <StatusBanner v-if="status === 'loading'" class="blog__status" aria-live="polite">
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
