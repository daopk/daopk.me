<script setup lang="ts">
import { computed, inject } from "vue";

import { useVfs } from "~/composables/useVfs";
import { AppContextInjectionKey } from "~/types/app";

import { useBlogPost } from "./useBlogPost";

const ctx = inject(AppContextInjectionKey, null);
const vfs = useVfs();

const { html, loadFailed, notFound, slug, status } = useBlogPost({
  args: ctx?.args,
  readText: vfs.readText,
});

const debugHandleId = import.meta.env.DEV ? ctx?.handleId : undefined;
const missingLabel = computed(() => slug.value ?? "post");
</script>

<template>
  <article
    class="blog"
    :aria-busy="status === 'loading' ? 'true' : undefined"
    :data-handle-id="debugHandleId"
  >
    <div v-if="html" class="blog__content" v-html="html" />
    <section v-else-if="notFound" class="blog__state" aria-live="polite">
      <p class="blog__eyebrow">Blog</p>
      <h1>Post not found</h1>
      <p>The post "{{ missingLabel }}" is not available.</p>
    </section>
    <p v-else-if="loadFailed" class="blog__error">Could not load blog post.</p>
  </article>
</template>

<style scoped lang="scss">
.blog {
  block-size: 100%;
  color: var(--color-fg);
  font-size: 15px;
  inline-size: 100%;
  line-height: 1.65;
  overflow-x: hidden;
  overflow-y: auto;
  padding-block-end: calc(var(--space-xl) + var(--mobile-shell-app-bottom-padding, 0px));
  padding-block-start: var(--space-lg);
  padding-inline-end: calc(var(--space-xl) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-xl) + var(--mobile-shell-app-safe-area-left, 0px));
}

.blog__content {
  margin-inline: auto;
  max-inline-size: 68ch;
  overflow-wrap: anywhere;
  word-break: normal;
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
.blog__error {
  margin-inline: auto;
  max-inline-size: 52ch;
}

.blog__state {
  padding-block-start: var(--space-xl);
}

.blog__state h1 {
  font-size: 24px;
  font-weight: 650;
  line-height: 1.2;
  margin: 0 0 var(--space-sm);
}

.blog__state p,
.blog__error {
  color: var(--color-fg-muted);
  margin: 0;
}

.blog__eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  margin-block-end: var(--space-xs) !important;
  text-transform: uppercase;
}
</style>
