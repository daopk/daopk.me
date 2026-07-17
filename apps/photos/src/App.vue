<script setup vapor lang="ts">
import { computed, ref } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  ScrollArea,
  ToolbarTitle,
  useAppChrome,
} from "@daopk/kit";
import { Alert, Button, IconButton } from "@daopk/ui";
import { RefreshCw } from "@daopk/icons";

import { PHOTO_THUMB_WIDTH, PHOTO_THUMB_WIDTH_2X, photoThumbUrl } from "./photosContentConfig";

import PhotoLightbox from "./PhotoLightbox.vue";
import { photoLabel } from "./photoLabel";
import { usePhotos } from "./usePhotos";

useAppChrome({ title: () => "Photos" });

const gallery = usePhotos();

const activeIndex = ref<number | null>(null);

const initialLoading = computed(() => gallery.loading.value && gallery.photos.value.length === 0);
const countLabel = computed(() => {
  if (gallery.status.value !== "ready") {
    return undefined;
  }
  const count = gallery.photos.value.length;
  return `${count} ${count === 1 ? "photo" : "photos"}`;
});

function reload(): void {
  void gallery.refresh();
}

function openLightbox(index: number): void {
  activeIndex.value = index;
}

function closeLightbox(): void {
  activeIndex.value = null;
}
</script>

<template>
  <AppFrame class="photos" layout="flex-column" aria-label="Photos">
    <AppToolbar class="photos__toolbar" density="comfortable">
      <ToolbarTitle title="Photos" :subtitle="countLabel" />
      <template #end>
        <IconButton ariaLabel="Refresh" :disabled="gallery.loading.value" @click="reload">
          <RefreshCw aria-hidden="true" />
        </IconButton>
      </template>
    </AppToolbar>

    <ScrollArea class="photos__body" safe-area>
      <Alert
        v-if="initialLoading"
        class="photos__status"
        color="gray"
        variant="surface"
        role="status"
      >
        Loading photos...
      </Alert>

      <EmptyState
        v-else-if="gallery.loadFailed.value"
        class="photos__state"
        role="alert"
        title="Could not load photos"
        description="Check your connection and try again."
      >
        <Button variant="surface" @click="reload">
          <template #left><RefreshCw aria-hidden="true" /></template>
          Retry
        </Button>
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
              :src="photoThumbUrl(photo.key, PHOTO_THUMB_WIDTH)"
              :srcset="`${photoThumbUrl(photo.key, PHOTO_THUMB_WIDTH)} 1x, ${photoThumbUrl(
                photo.key,
                PHOTO_THUMB_WIDTH_2X,
              )} 2x`"
              :alt="photoLabel(photo.key)"
              loading="lazy"
              decoding="async"
            />
          </button>
        </li>
      </ul>
    </ScrollArea>

    <PhotoLightbox
      v-if="activeIndex !== null"
      :photos="gallery.photos.value"
      :index="activeIndex"
      @update:index="activeIndex = $event"
      @close="closeLightbox"
    />
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
  overflow: hidden;
  position: relative;
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

@media (max-width: 600px) {
  .photos__grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .photos__thumb {
    transition: none;
  }
}
</style>
