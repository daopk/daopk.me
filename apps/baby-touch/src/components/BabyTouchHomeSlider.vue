<script setup lang="ts">
import { computed, ref } from "vue";

const emit = defineEmits<{
  (event: "complete"): void;
}>();

const SLIDE_COMPLETE_THRESHOLD = 0.86;
const SLIDE_THUMB_SIZE = 48;

type SlideAxis = "x" | "y";

const slideProgress = ref(0);
const slideThumbOffset = ref(0);
const slidePointerId = ref<number | null>(null);
const slideAxis = ref<SlideAxis>("x");
const slideActive = ref(false);
let slideStartCoordinate = 0;
let slideTravel = 1;

const sliderStyle = computed<Record<string, string>>(() => ({
  "--baby-touch-slide-thumb-offset": `${slideThumbOffset.value}px`,
}));
const slidePercent = computed(() => Math.round(slideProgress.value * 100));

function clampProgress(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function coordinateForEvent(event: PointerEvent, axis: SlideAxis): number {
  return axis === "x" ? event.clientX : event.clientY;
}

function resetHomeSlide(): void {
  slidePointerId.value = null;
  slideActive.value = false;
  slideProgress.value = 0;
  slideThumbOffset.value = 0;
}

function releaseHomeSlidePointer(event: PointerEvent): void {
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  } catch {
    // Matching the capture fallback keeps cancellation paths quiet.
  }
}

function startHomeSlide(event: PointerEvent): void {
  const thumb = event.currentTarget as HTMLElement;
  const slider = thumb.closest<HTMLElement>(".baby-touch__home-slider") ?? thumb;
  const rect = slider.getBoundingClientRect();
  slideAxis.value = rect.height > rect.width ? "y" : "x";
  slideStartCoordinate = coordinateForEvent(event, slideAxis.value);
  slideTravel = Math.max(
    (slideAxis.value === "x" ? rect.width : rect.height) - SLIDE_THUMB_SIZE,
    1,
  );
  slidePointerId.value = event.pointerId;
  slideActive.value = true;
  slideProgress.value = 0;
  slideThumbOffset.value = 0;

  try {
    thumb.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail in tests and after interrupted touch starts.
  }
}

function moveHomeSlide(event: PointerEvent): void {
  if (slidePointerId.value !== event.pointerId) {
    return;
  }

  const coordinate = coordinateForEvent(event, slideAxis.value);
  slideProgress.value = clampProgress((coordinate - slideStartCoordinate) / slideTravel);
  slideThumbOffset.value = slideProgress.value * slideTravel;

  if (slideProgress.value >= SLIDE_COMPLETE_THRESHOLD) {
    releaseHomeSlidePointer(event);
    resetHomeSlide();
    emit("complete");
  }
}

function finishHomeSlide(event: PointerEvent): void {
  if (slidePointerId.value !== event.pointerId) {
    return;
  }

  const complete = slideProgress.value >= SLIDE_COMPLETE_THRESHOLD;
  releaseHomeSlidePointer(event);
  resetHomeSlide();

  if (complete) emit("complete");
}

function cancelHomeSlide(event: PointerEvent): void {
  if (slidePointerId.value !== event.pointerId) {
    return;
  }

  resetHomeSlide();
}
</script>

<template>
  <div
    class="baby-touch__home-slider"
    :class="{ 'baby-touch__home-slider--active': slideActive }"
    data-testid="baby-touch-home-slider"
    role="slider"
    aria-label="Slide back to Baby Touch home"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="slidePercent"
    :style="sliderStyle"
    tabindex="0"
    @click.stop.prevent
    @pointerdown.stop.prevent
    @pointermove.stop.prevent="moveHomeSlide"
    @pointerup.stop.prevent="finishHomeSlide"
    @pointercancel.stop.prevent="cancelHomeSlide"
    @lostpointercapture.stop.prevent="cancelHomeSlide"
  >
    <span class="baby-touch__home-slider-track" aria-hidden="true">
      <span class="baby-touch__home-slider-arrows">→ → → →</span>
      <span class="baby-touch__home-slider-target">X</span>
    </span>
    <span
      class="baby-touch__home-slider-thumb"
      data-testid="baby-touch-home-slider-thumb"
      aria-hidden="true"
      @pointerdown.stop.prevent="startHomeSlide"
      @pointermove.stop.prevent="moveHomeSlide"
      @pointerup.stop.prevent="finishHomeSlide"
      @pointercancel.stop.prevent="cancelHomeSlide"
      @lostpointercapture.stop.prevent="cancelHomeSlide"
    >
      {{ slideActive ? "→" : "X" }}
    </span>
  </div>
</template>
