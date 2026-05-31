<script setup lang="ts">
import { FocusTrap } from "focus-trap-vue";
import { computed, ref } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ScrollArea,
  StatusBanner,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import { Button } from "~/components/ui";
import { ChevronLeft, ChevronRight, RefreshCw, X as CloseIcon } from "~/icons/lucide";

import { usePhotos } from "./usePhotos";

useAppChrome({ title: () => "Photos" });

const gallery = usePhotos();

const activeIndex = ref<number | null>(null);

const activePhoto = computed(() =>
  activeIndex.value === null ? null : (gallery.photos.value[activeIndex.value] ?? null),
);
const hasPrevious = computed(() => activeIndex.value !== null && activeIndex.value > 0);
const hasNext = computed(
  () => activeIndex.value !== null && activeIndex.value < gallery.photos.value.length - 1,
);
const initialLoading = computed(
  () => gallery.loading.value && gallery.photos.value.length === 0,
);
const countLabel = computed(() => {
  if (gallery.status.value !== "ready") {
    return undefined;
  }
  const count = gallery.photos.value.length;
  return `${count} ${count === 1 ? "photo" : "photos"}`;
});
const lightboxLabel = computed(() =>
  activeIndex.value === null
    ? "Photo viewer"
    : `Photo ${activeIndex.value + 1} of ${gallery.photos.value.length}`,
);

function photoLabel(key: string): string {
  const fileName = key.split("/").pop() ?? key;
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.replace(/[-_]+/g, " ").trim() || fileName;
}

function reload(): void {
  void gallery.refresh();
}

function openLightbox(index: number): void {
  activeIndex.value = index;
}

function closeLightbox(): void {
  activeIndex.value = null;
}

function showPrevious(): void {
  if (hasPrevious.value && activeIndex.value !== null) {
    activeIndex.value -= 1;
  }
}

function showNext(): void {
  if (hasNext.value && activeIndex.value !== null) {
    activeIndex.value += 1;
  }
}

function onScrimClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    closeLightbox();
  }
}
</script>

<template>
  <AppFrame class="photos" layout="flex-column" aria-label="Photos">
    <AppToolbar class="photos__toolbar" density="comfortable">
      <ToolbarTitle title="Photos" :subtitle="countLabel" />
      <template #end>
        <IconButton
          label="Refresh"
          :icon="RefreshCw"
          :disabled="gallery.loading.value"
          @click="reload"
        />
      </template>
    </AppToolbar>

    <ScrollArea class="photos__body" safe-area>
      <StatusBanner v-if="initialLoading" class="photos__status" tone="info" aria-live="polite">
        Loading photos...
      </StatusBanner>

      <EmptyState
        v-else-if="gallery.loadFailed.value"
        class="photos__state"
        role="alert"
        title="Could not load photos"
        description="Check your connection and try again."
      >
        <Button variant="secondary" :icon-start="RefreshCw" @click="reload">Retry</Button>
      </EmptyState>

      <EmptyState
        v-else-if="gallery.empty.value"
        class="photos__state"
        aria-live="polite"
        title="No photos yet"
        description="Images uploaded to the gallery bucket will appear here."
      />

      <ul v-else class="photos__grid">
        <li v-for="(photo, index) in gallery.photos.value" :key="photo.key" class="photos__cell">
          <button
            type="button"
            class="photos__thumb"
            :aria-label="`View ${photoLabel(photo.key)}`"
            @click="openLightbox(index)"
          >
            <img
              class="photos__image"
              :src="photo.url"
              :alt="photoLabel(photo.key)"
              loading="lazy"
              decoding="async"
            />
          </button>
        </li>
      </ul>
    </ScrollArea>

    <FocusTrap
      v-if="activePhoto"
      :active="true"
      :initial-focus="'.photos__lightbox-close'"
      :return-focus-on-deactivate="true"
      @deactivate="closeLightbox"
    >
      <div
        class="photos__lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="lightboxLabel"
        @click="onScrimClick"
        @keydown.left.prevent="showPrevious"
        @keydown.right.prevent="showNext"
      >
        <div class="photos__lightbox-bar">
          <span class="photos__lightbox-title">{{ photoLabel(activePhoto.key) }}</span>
          <IconButton
            class="photos__lightbox-close"
            label="Close photo viewer"
            :icon="CloseIcon"
            variant="subtle"
            @click="closeLightbox"
          />
        </div>

        <button
          v-if="hasPrevious"
          type="button"
          class="photos__nav photos__nav--prev"
          aria-label="Previous photo"
          @click.stop="showPrevious"
        >
          <ChevronLeft :size="30" aria-hidden="true" />
        </button>

        <img
          class="photos__lightbox-image"
          :src="activePhoto.url"
          :alt="photoLabel(activePhoto.key)"
          @click.stop
        />

        <button
          v-if="hasNext"
          type="button"
          class="photos__nav photos__nav--next"
          aria-label="Next photo"
          @click.stop="showNext"
        >
          <ChevronRight :size="30" aria-hidden="true" />
        </button>
      </div>
    </FocusTrap>
  </AppFrame>
</template>

<style scoped lang="scss">
.photos {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}

.photos__toolbar {
  border-block-end: 1px solid var(--color-border);
}

.photos__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-md);
  min-block-size: 0;
  padding: var(--space-md);
}

.photos__status {
  margin: 0;
}

.photos__state {
  margin: auto;
  padding-block: var(--space-2xl);
}

.photos__grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.photos__cell {
  min-inline-size: 0;
}

.photos__thumb {
  aspect-ratio: 1 / 1;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: block;
  inline-size: 100%;
  overflow: hidden;
  padding: 0;
  transition:
    border-color var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
}

.photos__thumb:hover {
  border-color: var(--color-accent);
}

.photos__thumb:focus-visible {
  border-color: var(--color-accent);
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.photos__image {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
}

.photos__lightbox {
  align-items: center;
  background: color-mix(in oklab, var(--color-bg) 18%, rgb(0 0 0 / 82%));
  display: flex;
  inset: 0;
  justify-content: center;
  padding: var(--space-2xl) var(--space-lg);
  position: absolute;
  z-index: 5;
}

.photos__lightbox-bar {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  inset-block-start: 0;
  inset-inline: 0;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
}

.photos__lightbox-title {
  color: var(--color-fg-on-accent, #fff);
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photos__lightbox-close {
  color: var(--color-fg-on-accent, #fff);
  flex: 0 0 auto;
}

.photos__lightbox-image {
  border-radius: var(--radius-sm);
  display: block;
  max-block-size: 100%;
  max-inline-size: 100%;
  object-fit: contain;
}

.photos__nav {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-elevated) 70%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full, 999px);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  block-size: 44px;
  inline-size: 44px;
  justify-content: center;
  position: absolute;
  inset-block-start: 50%;
  transform: translateY(-50%);
  transition: background-color var(--duration-fast) var(--ease);
}

.photos__nav:hover,
.photos__nav:focus-visible {
  background: var(--color-bg-elevated);
}

.photos__nav:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.photos__nav--prev {
  inset-inline-start: var(--space-md);
}

.photos__nav--next {
  inset-inline-end: var(--space-md);
}

@media (max-width: 600px) {
  .photos__grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .photos__thumb,
  .photos__nav {
    transition: none;
  }
}
</style>
