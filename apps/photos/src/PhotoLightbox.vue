<script setup lang="ts">
import { FocusTrap } from "focus-trap-vue";
import { computed, ref, watch } from "vue";

import { IconButton } from "@daopk/kit";
import { ChevronLeft, ChevronRight, X as CloseIcon } from "@daopk/icons";

import { photoLabel } from "./photoLabel";
import type { Photo } from "./usePhotos";
import { useLightboxGestures } from "./useLightboxGestures";

const props = defineProps<{
  photos: readonly Photo[];
  index: number;
}>();

const emit = defineEmits<{
  (event: "update:index", value: number): void;
  (event: "close"): void;
}>();

const activePhoto = computed(() => props.photos[props.index] ?? null);
const hasPrevious = computed(() => props.index > 0);
const hasNext = computed(() => props.index < props.photos.length - 1);
const label = computed(() =>
  activePhoto.value === null
    ? "Photo viewer"
    : `Photo ${props.index + 1} of ${props.photos.length}`,
);

function close(): void {
  emit("close");
}

function showPrevious(): void {
  if (hasPrevious.value) {
    emit("update:index", props.index - 1);
  }
}

function showNext(): void {
  if (hasNext.value) {
    emit("update:index", props.index + 1);
  }
}

function onScrimClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    close();
  }
}

const stage = ref<HTMLElement | null>(null);
const { transformStyle, isZoomed, reset } = useLightboxGestures(stage, {
  onPrev: showPrevious,
  onNext: showNext,
  onClose: close,
});

watch(
  () => props.index,
  () => {
    reset();
  },
);
</script>

<template>
  <FocusTrap
    v-if="activePhoto"
    :active="true"
    :initial-focus="'.photos__lightbox-close'"
    :return-focus-on-deactivate="true"
    @deactivate="close"
  >
    <div
      class="photos__lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
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
          @click="close"
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

      <div ref="stage" class="photos__stage" :class="{ 'photos__stage--zoomed': isZoomed }">
        <img
          class="photos__lightbox-image"
          :style="transformStyle"
          :src="activePhoto.url"
          :alt="photoLabel(activePhoto.key)"
          draggable="false"
        />
      </div>

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
</template>

<style scoped lang="scss">
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
  z-index: 1;
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

.photos__stage {
  align-items: center;
  display: flex;
  justify-content: center;
  max-block-size: 100%;
  max-inline-size: 100%;
  overflow: hidden;
  touch-action: none;
}

.photos__stage--zoomed {
  cursor: grab;
}

.photos__lightbox-image {
  border-radius: var(--radius-sm);
  display: block;
  max-block-size: 100%;
  max-inline-size: 100%;
  object-fit: contain;
  transform-origin: center center;
  user-select: none;
  will-change: transform;
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

@media (prefers-reduced-motion: reduce) {
  .photos__nav {
    transition: none;
  }
}
</style>
