<script setup vapor lang="ts">
import { computed } from "vue";

import {
  capturePointer,
  pointFromPointerEvent,
  releasePointer,
  type BabyTouchPointerMode,
} from "../babyTouchPointer";
import type {
  BabyTouchPoint,
  BabyTouchSettings,
  BabyTouchStageSize,
  BabyTouchSticker,
} from "../babyTouchTypes";
import { useBabyTouchGame } from "../useBabyTouchGame";
import BabyTouchHomeSlider from "./BabyTouchHomeSlider.vue";
import BabyTouchStickerItem from "./BabyTouchSticker.vue";

const props = defineProps<{
  readonly handleParentCornerDown: (pointerId: number, point: BabyTouchPoint) => boolean;
  readonly handleParentCornerUp: (pointerId: number) => void;
  readonly playTapTone: (sticker: BabyTouchSticker) => void;
  readonly pointerMode: BabyTouchPointerMode;
  readonly settings: BabyTouchSettings;
  readonly settingsLabel: string;
}>();

const emit = defineEmits<{
  (event: "home"): void;
}>();

const gameSettings = computed(() => props.settings);
const { activeCount, spawnSticker, stickers } = useBabyTouchGame({
  settings: gameSettings,
});

function stageSizeFromPointerEvent(
  event: PointerEvent,
  pointerMode: BabyTouchPointerMode,
): BabyTouchStageSize {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();

  if (pointerMode === "landscape-right") {
    return {
      width: rect.height,
      height: rect.width,
    };
  }

  return {
    width: rect.width,
    height: rect.height,
  };
}

function onPointerDown(event: PointerEvent): void {
  const point = pointFromPointerEvent(event, props.pointerMode);
  const stageSize = stageSizeFromPointerEvent(event, props.pointerMode);
  capturePointer(event);
  event.preventDefault();

  props.handleParentCornerDown(event.pointerId, point);

  const sticker = spawnSticker(point, stageSize);
  props.playTapTone(sticker);
}

function onPointerEnd(event: PointerEvent): void {
  props.handleParentCornerUp(event.pointerId);
  releasePointer(event);
}
</script>

<template>
  <section
    class="baby-touch__play-surface"
    data-testid="baby-touch-surface"
    :aria-label="settingsLabel"
    @pointerdown="onPointerDown"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @lostpointercapture="onPointerEnd"
    @contextmenu.prevent
    @dragstart.prevent
  >
    <div class="baby-touch__stage" aria-hidden="true">
      <BabyTouchStickerItem v-for="sticker in stickers" :key="sticker.id" :sticker="sticker" />
    </div>

    <BabyTouchHomeSlider @complete="emit('home')" />

    <p class="baby-touch__status" aria-live="polite">{{ activeCount }}</p>
  </section>
</template>
