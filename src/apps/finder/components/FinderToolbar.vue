<script setup lang="ts">
import { ArrowUp, ChevronRight, Grid2X2, List, Pencil, RefreshCw } from "~/icons/lucide";
import { FinderPdfFileIcon, SlidesAppIcon } from "~/icons/fluentColor";

import type { FinderBreadcrumb, FinderViewMode } from "../useFinder";

defineProps<{
  readonly breadcrumbs: readonly FinderBreadcrumb[];
  readonly cwd: string;
  readonly selectedEditableFile: boolean;
  readonly selectedPdfFile: boolean;
  readonly selectedSlideDeckFile: boolean;
  readonly viewMode: FinderViewMode;
}>();

const emit = defineEmits<{
  breadcrumb: [path: string];
  goUp: [];
  openEditor: [];
  openPdfViewer: [];
  openSlides: [];
  refresh: [];
  setViewMode: [mode: FinderViewMode];
}>();
</script>

<template>
  <header class="finder__toolbar">
    <button
      type="button"
      class="finder__icon-button"
      :disabled="cwd === '/' || undefined"
      aria-label="Go to parent folder"
      @click="emit('goUp')"
    >
      <ArrowUp :size="16" aria-hidden="true" />
    </button>

    <nav class="finder__breadcrumbs" aria-label="Current folder">
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
        <button
          type="button"
          class="finder__breadcrumb"
          :aria-current="crumb.path === cwd ? 'page' : undefined"
          @click="emit('breadcrumb', crumb.path)"
        >
          {{ crumb.label }}
        </button>
        <ChevronRight
          v-if="index < breadcrumbs.length - 1"
          class="finder__breadcrumb-separator"
          :size="14"
          aria-hidden="true"
        />
      </template>
    </nav>

    <button
      type="button"
      class="finder__icon-button"
      aria-label="Refresh folder"
      @click="emit('refresh')"
    >
      <RefreshCw :size="16" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="finder__toolbar-button"
      :disabled="!selectedSlideDeckFile || undefined"
      @click="emit('openSlides')"
    >
      <SlidesAppIcon class="finder__toolbar-icon" aria-hidden="true" />
      <span>Open in Slides</span>
    </button>

    <button
      type="button"
      class="finder__toolbar-button"
      :disabled="!selectedEditableFile || undefined"
      @click="emit('openEditor')"
    >
      <Pencil :size="15" aria-hidden="true" />
      <span>Open in Editor</span>
    </button>

    <button
      type="button"
      class="finder__toolbar-button"
      :disabled="!selectedPdfFile || undefined"
      @click="emit('openPdfViewer')"
    >
      <FinderPdfFileIcon class="finder__toolbar-icon" aria-hidden="true" />
      <span>Open in PDF Viewer</span>
    </button>

    <div class="finder__view-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        class="finder__toggle-button"
        :class="{ 'finder__toggle-button--active': viewMode === 'list' }"
        :aria-pressed="viewMode === 'list'"
        aria-label="List view"
        @click="emit('setViewMode', 'list')"
      >
        <List :size="16" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="finder__toggle-button"
        :class="{ 'finder__toggle-button--active': viewMode === 'grid' }"
        :aria-pressed="viewMode === 'grid'"
        aria-label="Grid view"
        @click="emit('setViewMode', 'grid')"
      >
        <Grid2X2 :size="16" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.finder__toolbar {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
  min-block-size: 44px;
  padding: var(--space-xs) var(--space-sm);
}

.finder__icon-button,
.finder__toggle-button,
.finder__toolbar-button,
.finder__breadcrumb {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  justify-content: center;
}

.finder__icon-button,
.finder__toggle-button {
  block-size: 32px;
  inline-size: 32px;
}

.finder__toolbar-button {
  block-size: 32px;
  gap: var(--space-xs);
  padding: 0 var(--space-sm);
  white-space: nowrap;
}

.finder__toolbar-icon {
  block-size: 16px;
  inline-size: 16px;
}

.finder__icon-button:hover,
.finder__toggle-button:hover,
.finder__toolbar-button:hover,
.finder__breadcrumb:hover,
.finder__icon-button:focus-visible,
.finder__toggle-button:focus-visible,
.finder__toolbar-button:focus-visible,
.finder__breadcrumb:focus-visible {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.finder__icon-button:focus-visible,
.finder__toggle-button:focus-visible,
.finder__toolbar-button:focus-visible,
.finder__breadcrumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.finder__icon-button:disabled,
.finder__toolbar-button:disabled {
  color: var(--color-fg-muted);
  cursor: default;
  opacity: 0.45;
}

.finder__icon-button:disabled:hover,
.finder__toolbar-button:disabled:hover {
  background: transparent;
}

.finder__breadcrumbs {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  min-inline-size: 0;
  overflow: hidden;
}

.finder__breadcrumb {
  block-size: 30px;
  flex: 0 1 auto;
  min-inline-size: 0;
  padding: 0 var(--space-xs);
}

.finder__breadcrumb[aria-current="page"] {
  color: var(--color-fg);
  font-weight: 600;
}

.finder__breadcrumb-separator {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
}

.finder__view-toggle {
  align-items: center;
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
  border-radius: var(--radius-md);
  display: inline-flex;
  gap: 1px;
  padding: 2px;
}

.finder__toggle-button--active {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

@media (max-width: 640px) {
  .finder__toolbar {
    flex-wrap: wrap;
  }
}
</style>
