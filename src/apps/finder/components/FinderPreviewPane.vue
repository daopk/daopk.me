<script setup lang="ts">
import type { VfsDirEntry } from "@daopk/sdk";

import { FinderFileIcon } from "~/icons/fluentColor";

import type { FinderPreviewKind } from "../composables/useFinderPreview";
import { entryIcon, entryKindLabel, formatBytes, formatModified } from "../utils/display";

defineProps<{
  readonly html: string;
  readonly imageUrl: string;
  readonly kind: FinderPreviewKind;
  readonly loading: boolean;
  readonly message: string;
  readonly path: string | null;
  readonly selectedEntry: VfsDirEntry | null;
  readonly text: string;
  readonly title: string;
}>();
</script>

<template>
  <aside class="finder__preview" aria-label="Preview">
    <div v-if="loading" class="finder__preview-placeholder">Loading preview...</div>
    <div v-else-if="kind === 'empty'" class="finder__preview-placeholder">
      {{ message }}
    </div>
    <div v-else class="finder__preview-content">
      <header class="finder__preview-header">
        <component
          :is="selectedEntry ? entryIcon(selectedEntry) : FinderFileIcon"
          class="finder__preview-icon"
          :size="24"
          aria-hidden="true"
        />
        <div class="finder__preview-heading">
          <h2>{{ title }}</h2>
          <p>{{ path }}</p>
        </div>
      </header>

      <dl v-if="selectedEntry" class="finder__preview-meta">
        <div>
          <dt>Kind</dt>
          <dd>{{ entryKindLabel(selectedEntry) }}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{{ selectedEntry.kind === "file" ? formatBytes(selectedEntry.size) : "-" }}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{{ formatModified(selectedEntry.updatedAt) }}</dd>
        </div>
      </dl>

      <div v-if="kind === 'directory'" class="finder__preview-message">
        {{ message }}
      </div>
      <div v-else-if="kind === 'markdown'" class="finder__preview-markdown" v-html="html" />
      <pre v-else-if="kind === 'text'" class="finder__preview-text">{{ text }}</pre>
      <img
        v-else-if="kind === 'image'"
        class="finder__preview-image"
        :src="imageUrl"
        :alt="title"
      />
      <div v-else class="finder__preview-message">{{ message }}</div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.finder__preview {
  background: var(--color-bg);
  min-block-size: 0;
  min-inline-size: 0;
  overflow: auto;
}

.finder__preview-placeholder,
.finder__preview-message {
  color: var(--color-fg-muted);
  padding: var(--space-md);
}

.finder__preview-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}

.finder__preview-header {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.finder__preview-icon {
  flex: 0 0 auto;
}

.finder__preview-heading {
  min-inline-size: 0;
}

.finder__preview-heading h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  overflow-wrap: anywhere;
}

.finder__preview-heading p {
  color: var(--color-fg-muted);
  font-size: 12px;
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}

.finder__preview-meta {
  border-block: 1px solid var(--color-border);
  display: grid;
  gap: var(--space-xs);
  margin: 0;
  padding: var(--space-sm) 0;
}

.finder__preview-meta div {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 72px minmax(0, 1fr);
}

.finder__preview-meta dt {
  color: var(--color-fg-muted);
}

.finder__preview-meta dd {
  margin: 0;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.finder__preview-markdown,
.finder__preview-text {
  overflow-wrap: anywhere;
}

.finder__preview-markdown :deep(h1),
.finder__preview-markdown :deep(h2),
.finder__preview-markdown :deep(h3) {
  font-size: 15px;
  margin: 0 0 var(--space-sm);
}

.finder__preview-markdown :deep(p),
.finder__preview-markdown :deep(ul),
.finder__preview-markdown :deep(ol),
.finder__preview-markdown :deep(pre) {
  margin: 0 0 var(--space-sm);
}

.finder__preview-text {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  max-block-size: 320px;
  overflow: auto;
  padding: var(--space-sm);
  white-space: pre-wrap;
}

.finder__preview-image {
  block-size: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  inline-size: 100%;
  object-fit: contain;
}
</style>
