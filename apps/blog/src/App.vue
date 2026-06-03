<script setup lang="ts">
import { computed, inject, onUnmounted, ref } from "vue";

import {
  AppToolbar,
  AppFrame,
  EmptyState,
  IconButton,
  ListButton,
  ScrollArea,
  SectionHeader,
  StatusBanner,
  useAppChrome,
} from "@daopk/kit";
import { Button } from "@daopk/ui";
import { blogPostPathFromSlug, createBlogContentSource, isBlogPostSlug } from "@daopk/content";
import { ArrowLeft, Check, Share2 } from "@daopk/icons";
import {
  AppContextInjectionKey,
  normalizeVfsPath,
  useKernel,
  useVfs,
  type AppChromeBackAction,
} from "@daopk/sdk";

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
const currentPostPath = ref<string | null>(
  initialSlug === null ? null : documentPathFromPostArgs(ctx?.args),
);
const missingLabel = computed(() => blogPost.slug.value ?? "post");
const notFoundDescription = computed(() => `The post "${missingLabel.value}" is not available.`);
const busy = computed(
  () =>
    (view.value === "index" && blogIndex.status.value === "loading") ||
    (view.value === "post" && blogPost.status.value === "loading"),
);
const currentPostCover = computed(() => {
  if (view.value !== "post" || blogPost.status.value !== "ready") {
    return null;
  }

  const slug = blogPost.slug.value;
  if (slug === null) {
    return null;
  }

  return blogIndex.posts.value.find((post) => post.slug === slug)?.thumbnail ?? null;
});

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
const shareCopied = ref(false);
const shareButtonLabel = computed(() => (shareCopied.value ? "Copied URL" : "Share post"));
const shareButtonIcon = computed(() => (shareCopied.value ? Check : Share2));
let shareCopiedTimeout: number | undefined;

onUnmounted(() => {
  stopOpenRequests();
  clearShareCopiedTimeout();
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
  currentPostPath.value = null;
  emitDocumentPath(null);
  replaceBrowserPath("/blog");
}

function openPost(args: { readonly slug: string; readonly path?: string }): void {
  view.value = "post";
  currentPostPath.value = documentPathFromPostArgs(args);
  emitDocumentPath(currentPostPath.value);
  blogPost.open(args);
  replaceBlogPostPath(args.slug);
}

function documentPathFromPostArgs(
  args: { readonly slug?: unknown; readonly path?: unknown } | null | undefined,
): string | null {
  if (typeof args?.path === "string") {
    try {
      return normalizeVfsPath(args.path);
    } catch {
      // Fall back to slug-derived paths below.
    }
  }

  if (typeof args?.slug !== "string") {
    return null;
  }

  return blogPostPathFromSlug(args.slug);
}

function emitDocumentPath(path: string | null): void {
  if (ctx === null) {
    return;
  }

  kernel.events.emit("app.document.changed", {
    manifestId: ctx.manifestId,
    handleId: ctx.handleId,
    path,
  });
}

emitDocumentPath(currentPostPath.value);

function onPostSelect(post: BlogIndexPost): void {
  openPost({ slug: post.slug, path: post.path });
}

function clearShareCopiedTimeout(): void {
  if (shareCopiedTimeout === undefined || typeof window === "undefined") {
    return;
  }

  window.clearTimeout(shareCopiedTimeout);
  shareCopiedTimeout = undefined;
}

function markShareCopied(): void {
  shareCopied.value = true;
  clearShareCopiedTimeout();
  shareCopiedTimeout = window.setTimeout(() => {
    shareCopied.value = false;
    shareCopiedTimeout = undefined;
  }, 1600);
}

async function copyCurrentUrl(): Promise<void> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return;
  }

  const writeText = navigator.clipboard?.writeText;
  if (writeText === undefined) {
    return;
  }

  try {
    await writeText.call(navigator.clipboard, window.location.href);
    markShareCopied();
  } catch {
    shareCopied.value = false;
  }
}

function onShareClick(): void {
  void copyCurrentUrl();
}
</script>

<template>
  <AppFrame
    as="article"
    class="blog"
    layout="flex-column"
    :safe-area="false"
    :aria-busy="busy ? 'true' : undefined"
    :data-handle-id="debugHandleId"
  >
    <AppToolbar
      v-if="view === 'post' && !chrome.available"
      class="blog__post-toolbar"
      density="comfortable"
      wrap
    >
      <Button class="blog__back" size="sm" :icon-start="ArrowLeft" @click="openIndex">
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
          @click="onShareClick"
        />
      </template>
    </AppToolbar>

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
          <div v-if="currentPostCover" class="blog__post-cover">
            <img
              class="blog__post-cover-image"
              :src="currentPostCover.url"
              :alt="currentPostCover.alt"
              :width="currentPostCover.width"
              :height="currentPostCover.height"
              decoding="async"
            />
          </div>
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
  flex: 1 1 auto;
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
  gap: var(--space-xl);
  list-style: none;
  margin: 0;
  padding: 0;
}

.blog__index-item {
  background: transparent;
  border: 0;
  border-radius: 0;
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-xs);
  inline-size: 100%;
  padding: 0;
  text-align: start;
  transition: color var(--duration-fast) var(--ease);
}

.blog__index-item:hover,
.blog__index-item:focus-visible {
  background: transparent;
}

.blog__index-item:hover .blog__index-title,
.blog__index-item:focus-visible .blog__index-title {
  color: var(--color-accent);
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

.blog__post-cover {
  aspect-ratio: 16 / 9;
  border: 1px solid color-mix(in srgb, var(--color-fg) 10%, transparent);
  border-radius: var(--radius-md);
  display: block;
  inline-size: 100%;
  margin-block-end: var(--space-lg);
  overflow: hidden;
}

.blog__post-cover-image {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
}

.blog__share-status {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  min-inline-size: 4.5ch;
  text-align: end;
  white-space: nowrap;
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
