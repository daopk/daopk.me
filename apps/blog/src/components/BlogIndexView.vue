<script setup lang="ts">
import { EmptyState, ListButton, SectionHeader, StatusBanner } from "@daopk/kit";

import type { BlogIndexPost } from "../composables/useBlogIndex";

defineProps<{
  readonly empty: boolean;
  readonly loadFailed: boolean;
  readonly loading: boolean;
  readonly posts: readonly BlogIndexPost[];
}>();

defineEmits<{
  "select-post": [post: BlogIndexPost];
}>();
</script>

<template>
  <section class="blog__index" aria-label="Latest blog posts">
    <SectionHeader class="blog__index-header" title="Latest posts" :level="1" size="page" />

    <StatusBanner v-if="loading" class="blog__status">Loading posts...</StatusBanner>
    <EmptyState
      v-else-if="loadFailed"
      class="blog__state"
      aria-live="polite"
      title="Could not load posts"
      description="Try opening Blog again."
    />
    <EmptyState v-else-if="empty" class="blog__state" aria-live="polite" title="No posts yet" />
    <ol v-else class="blog__index-list">
      <li v-for="post in posts" :key="post.slug">
        <ListButton class="blog__index-item" @click="$emit('select-post', post)">
          <span v-if="post.date && post.formattedDate" class="blog__index-date">
            <time :datetime="post.date">{{ post.formattedDate }}</time>
          </span>
          <span class="blog__index-title">{{ post.title }}</span>
          <span v-if="post.excerpt" class="blog__index-excerpt">{{ post.excerpt }}</span>
        </ListButton>
      </li>
    </ol>
  </section>
</template>
