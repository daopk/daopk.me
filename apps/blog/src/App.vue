<script setup lang="ts">
import { inject } from "vue";

import { AppFrame, ScrollArea } from "@daopk/kit";
import { createBlogContentSource } from "@daopk/content";
import { AppContextInjectionKey, useKernel, useVfs } from "@daopk/sdk";

import BlogIndexView from "./components/BlogIndexView.vue";
import BlogPostReader from "./components/BlogPostReader.vue";
import BlogPostToolbar from "./components/BlogPostToolbar.vue";
import { useBlogAppController } from "./composables/useBlogAppController";
import { useBlogIndex } from "./composables/useBlogIndex";
import { useBlogPost } from "./composables/useBlogPost";
import "./styles/blog.scss";

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();

const blogSource = createBlogContentSource({
  vfs: {
    readText: vfs.readText,
    writeText: vfs.writeText,
    mkdir: vfs.mkdir,
  },
});

const blogIndex = useBlogIndex({ source: blogSource });
const blogPost = useBlogPost({
  args: ctx?.args,
  source: blogSource,
});
const blogApp = useBlogAppController({
  appContext: ctx,
  blogIndex,
  blogPost,
  kernel,
});
</script>

<template>
  <AppFrame
    as="article"
    class="blog"
    layout="flex-column"
    :safe-area="false"
    :aria-busy="blogApp.busy.value ? 'true' : undefined"
    :data-handle-id="blogApp.debugHandleId"
  >
    <BlogPostToolbar
      v-if="blogApp.view.value === 'post' && !blogApp.chromeAvailable"
      :share-button-icon="blogApp.shareButtonIcon.value"
      :share-button-label="blogApp.shareButtonLabel.value"
      :share-copied="blogApp.shareCopied.value"
      @back="blogApp.openIndex"
      @share="blogApp.onShareClick"
    />

    <ScrollArea class="blog__scroll">
      <BlogIndexView
        v-if="blogApp.view.value === 'index'"
        :empty="blogIndex.empty.value"
        :load-failed="blogIndex.loadFailed.value"
        :loading="blogIndex.loading.value"
        :posts="blogIndex.posts.value"
        @select-post="blogApp.onPostSelect"
      />

      <BlogPostReader
        v-else
        :cover="blogApp.currentPostCover.value"
        :html="blogPost.html.value"
        :load-failed="blogPost.loadFailed.value"
        :not-found="blogPost.notFound.value"
        :not-found-description="blogApp.notFoundDescription.value"
        :status="blogPost.status.value"
        @content-click="blogApp.onPostContentClick"
      />
    </ScrollArea>
  </AppFrame>
</template>
