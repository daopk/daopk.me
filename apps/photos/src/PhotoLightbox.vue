<script setup vapor lang="ts">
import { computed, ref, watch } from "vue";
import { Modal, type ModalFocusTrapOptions } from "ropav/modal";

import { Icon, IconButton } from "@daopk/ui";
import ChevronLeft from "~icons/lucide/chevron-left";
import ChevronRight from "~icons/lucide/chevron-right";
import CloseIcon from "~icons/lucide/x";

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

const stage = ref<HTMLElement | null>(null);
const image = ref<HTMLImageElement | null>(null);

const LIGHTBOX_CONTENT_BASE_Z_INDEX = 5;
const focusTrapOptions: ModalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" },
};
const modalClassNames = {
  root: "photos__lightbox",
  overlay: "photos__lightbox-overlay",
  panel: "photos__lightbox-panel",
  body: "photos__lightbox-body",
};

const { transformStyle, isZoomed, reset } = useLightboxGestures(stage, {
  content: image,
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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPrevious();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    showNext();
  }
}
</script>

<template>
  <Modal
    v-if="activePhoto"
    :open="true"
    :aria-label="label"
    size="100%"
    :base-z-index="LIGHTBOX_CONTENT_BASE_Z_INDEX"
    :teleport="false"
    :show-close-button="false"
    initial-focus=".photos__lightbox-close"
    :focus-trap-options="focusTrapOptions"
    :overlay-props="{
      color: 'color-mix(in oklab, var(--color-bg) 18%, rgb(0 0 0 / 82%))',
    }"
    :class-names="modalClassNames"
    @close="close"
  >
    <div class="photos__lightbox-content" @keydown="onKeydown">
      <div class="photos__lightbox-bar">
        <span class="photos__lightbox-title">{{ photoLabel(activePhoto.key) }}</span>
        <IconButton
          class="photos__lightbox-close"
          ariaLabel="Close photo viewer"
          variant="subtle"
          @click="close"
        >
          <CloseIcon aria-hidden="true" />
        </IconButton>
      </div>

      <button
        v-if="hasPrevious"
        type="button"
        class="photos__nav photos__nav--prev"
        aria-label="Previous photo"
        @click.stop="showPrevious"
      >
        <Icon :icon="ChevronLeft" :size="30" aria-hidden="true" />
      </button>

      <div ref="stage" class="photos__stage" :class="{ 'photos__stage--zoomed': isZoomed }">
        <img
          ref="image"
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
        <Icon :icon="ChevronRight" :size="30" aria-hidden="true" />
      </button>
    </div>
  </Modal>
</template>

<style lang="scss">
.photos__lightbox {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: var(--space-2xl) var(--space-lg);
  position: absolute;
  z-index: 5;
}

.photos__lightbox-panel {
  background: transparent;
  block-size: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  inline-size: 100%;
  max-block-size: 100%;
  overflow: visible;
}

.photos__lightbox-body {
  min-block-size: 0;
  overflow: hidden;
  padding: 0;
}

.photos__lightbox-content {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  block-size: 100%;
  inline-size: 100%;
  justify-content: center;
  min-block-size: 0;
  overflow: hidden;
  padding: 0;
  position: relative;
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
  color: var(--color-fg-on-accent);
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photos__lightbox-close {
  color: var(--color-fg-on-accent);
  flex: 0 0 auto;
}

.photos__stage {
  align-items: center;
  block-size: 100%;
  display: flex;
  inline-size: 100%;
  justify-content: center;
  max-block-size: 100%;
  max-inline-size: 100%;
  min-block-size: 0;
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
  z-index: 1;
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
