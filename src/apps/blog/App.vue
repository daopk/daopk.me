<script setup lang="ts">
import { computed, inject, onUnmounted, ref } from "vue";

import {
  AppFrame,
  EmptyState,
  ListButton,
  ScrollArea,
  SectionHeader,
  StatusBanner,
  useAppChrome,
} from "~/components/kit";
import { Button } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useVfs } from "~/composables/useVfs";
import { createBlogContentSource } from "~/core/blog/blogContentSource";
import { isBlogPostSlug } from "~/core/routing/blogPaths";
import { ArrowLeft } from "~/icons/lucide";
import { AppContextInjectionKey, type AppChromeBackAction } from "~/types/app";

import { useBlogIndex, type BlogIndexPost } from "./useBlogIndex";
import { useBlogPost } from "./useBlogPost";

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

const debugHandleId = import.meta.env.DEV ? ctx?.handleId : undefined;
const initialSlug =
  typeof ctx?.args.slug === "string" && ctx.args.slug.length > 0 ? ctx.args.slug : null;
const view = ref<"index" | "post">(initialSlug === null ? "index" : "post");
const missingLabel = computed(() => blogPost.slug.value ?? "post");
const notFoundDescription = computed(() => `The post "${missingLabel.value}" is not available.`);
const busy = computed(
  () =>
    (view.value === "index" && blogIndex.status.value === "loading") ||
    (view.value === "post" && blogPost.status.value === "loading"),
);

const stopOpenRequests = kernel.events.on("blog.open.requested", (payload) => {
  const slug = typeof payload.slug === "string" && payload.slug.length > 0 ? payload.slug : null;
  if (slug === null) {
    openIndex();
    return;
  }

  openPost({
    slug,
    ...(typeof payload.path === "string" ? { path: payload.path } : {}),
  });
});

const chromeTitle = computed(() =>
  view.value === "post" ? (blogPost.metadata.value.title ?? "Blog") : null,
);
const chromeBackAction = computed<AppChromeBackAction | null>(() =>
  view.value === "post" ? { ariaLabel: "Back to Blog", handler: openIndex } : null,
);
const chrome = useAppChrome({ title: chromeTitle, backAction: chromeBackAction });

onUnmounted(() => {
  stopOpenRequests();
});

function replaceBrowserPath(pathname: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (
    window.location.pathname === pathname &&
    window.location.search === "" &&
    window.location.hash === ""
  ) {
    return;
  }

  window.history.replaceState(window.history.state, "", pathname);
}

function replaceBlogPostPath(slug: string): void {
  if (!isBlogPostSlug(slug)) {
    return;
  }

  replaceBrowserPath(`/blog/${slug}`);
}

function openIndex(): void {
  view.value = "index";
  replaceBrowserPath("/blog");
}

function openPost(args: { readonly slug: string; readonly path?: string }): void {
  view.value = "post";
  blogPost.open(args);
  replaceBlogPostPath(args.slug);
}

function onPostSelect(post: BlogIndexPost): void {
  openPost({ slug: post.slug, path: post.path });
}
</script>

<template>
  <AppFrame
    as="article"
    class="blog"
    :safe-area="false"
    :aria-busy="busy ? 'true' : undefined"
    :data-handle-id="debugHandleId"
  >
    <ScrollArea class="blog__scroll">
      <section v-if="view === 'index'" class="blog__index" aria-label="Latest blog posts">
        <SectionHeader class="blog__index-header" title="Latest posts" :level="1" size="page" />

        <StatusBanner v-if="blogIndex.loading.value" class="blog__status">
          Loading posts...
        </StatusBanner>
        <EmptyState
          v-else-if="blogIndex.loadFailed.value"
          class="blog__state"
          aria-live="polite"
          title="Could not load posts"
          description="Try opening Blog again."
        />
        <EmptyState
          v-else-if="blogIndex.empty.value"
          class="blog__state"
          aria-live="polite"
          title="No posts yet"
        />
        <ol v-else class="blog__index-list">
          <li v-for="post in blogIndex.posts.value" :key="post.slug">
            <ListButton class="blog__index-item" @click="onPostSelect(post)">
              <span v-if="post.date && post.formattedDate" class="blog__index-date">
                <time :datetime="post.date">{{ post.formattedDate }}</time>
              </span>
              <span class="blog__index-title">{{ post.title }}</span>
              <span v-if="post.excerpt" class="blog__index-excerpt">{{ post.excerpt }}</span>
            </ListButton>
          </li>
        </ol>
      </section>

      <template v-else>
        <div class="blog__post-shell">
          <Button
            v-if="!chrome.available"
            class="blog__back"
            variant="ghost"
            size="sm"
            :icon-start="ArrowLeft"
            @click="openIndex"
          >
            All posts
          </Button>
          <div v-if="blogPost.html.value" class="blog__content" v-html="blogPost.html.value" />
          <StatusBanner
            v-else-if="blogPost.status.value === 'loading'"
            class="blog__status"
            aria-live="polite"
          >
            Loading post...
          </StatusBanner>
          <EmptyState
            v-else-if="blogPost.notFound.value"
            class="blog__state"
            aria-live="polite"
            title="Post not found"
            :description="notFoundDescription"
          />
          <StatusBanner v-else-if="blogPost.loadFailed.value" class="blog__error" tone="error">
            Could not load blog post.
          </StatusBanner>
        </div>
      </template>
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss">
.blog {
  color: var(--color-fg);
  font-size: 15px;
  line-height: 1.65;
}

.blog__scroll {
  block-size: 100%;
  padding-block-end: calc(var(--space-xl) + var(--mobile-shell-app-bottom-padding, 0px));
  padding-block-start: var(--space-lg);
  padding-inline-end: calc(var(--space-xl) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-xl) + var(--mobile-shell-app-safe-area-left, 0px));
}

.blog__content {
  margin-inline: auto;
  max-inline-size: 68ch;
  overflow-wrap: anywhere;
  user-select: text;
  word-break: normal;
}

.blog__content :deep(*) {
  user-select: text;
}

.blog__index {
  margin-inline: auto;
  max-inline-size: 760px;
}

.blog__index-header {
  margin-block-end: var(--space-lg);
}

.blog__index-list {
  display: grid;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.blog__index-item {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-xs);
  inline-size: 100%;
  padding: var(--space-md);
  text-align: start;
  transition:
    border-color var(--duration-fast) var(--ease),
    background-color var(--duration-fast) var(--ease);
}

.blog__index-item:hover,
.blog__index-item:focus-visible {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
}

.blog__index-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.blog__index-date {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
}

.blog__index-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: 1.25;
}

.blog__index-excerpt {
  color: var(--color-fg-muted);
  font-size: var(--font-size-base);
  line-height: 1.55;
}

.blog__post-shell {
  margin-inline: auto;
  max-inline-size: 68ch;
}

.blog__back {
  margin-block-end: var(--space-md);
}

.blog__content :deep(h1) {
  font-size: 28px;
  font-weight: 650;
  line-height: 1.15;
  margin: 0 0 var(--space-xs);
}

.blog__content :deep(.blog__date) {
  color: var(--color-fg-muted);
  font-size: 13px;
  margin: 0 0 var(--space-lg);
}

.blog__content :deep(h2) {
  font-size: 19px;
  font-weight: 650;
  margin: var(--space-lg) 0 var(--space-xs);
}

.blog__content :deep(p) {
  margin: 0 0 var(--space-md);
}

.blog__content :deep(ul),
.blog__content :deep(ol) {
  margin: 0 0 var(--space-md);
  padding-inline-start: var(--space-lg);
}

.blog__content :deep(li) {
  margin-block-end: 0.35em;
}

.blog__content :deep(a) {
  color: var(--color-accent);
}

.blog__content :deep(code) {
  background: color-mix(in srgb, var(--color-fg) 8%, transparent);
  border-radius: var(--radius-sm);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  padding: 1px 5px;
}

.blog__content :deep(pre) {
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-sm);
  margin: 0 0 var(--space-md);
  overflow-x: auto;
  padding: var(--space-sm);
}

.blog__content :deep(pre code) {
  background: transparent;
  border-radius: 0;
  display: block;
  padding: 0;
}

.blog__state,
.blog__error,
.blog__status {
  margin-inline: auto;
  max-inline-size: 52ch;
}

.blog__state {
  padding-block-start: var(--space-xl);
}

.blog__error,
.blog__status {
  color: var(--color-fg-muted);
  margin: 0;
}
</style>
