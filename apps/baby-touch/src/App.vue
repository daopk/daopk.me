<script setup lang="ts">
import { AppFrame, useAppChrome } from "@daopk/kit";
import { computed, ref } from "vue";

import { STICKER_SETS } from "./babyTouchStickerSets";
import type { BabyTouchBackground, BabyTouchScene } from "./babyTouchTypes";
import BabyTouchGallery from "./components/BabyTouchGallery.vue";
import BabyTouchHome from "./components/BabyTouchHome.vue";
import BabyTouchPlaySurface from "./components/BabyTouchPlaySurface.vue";
import { useBabyTouch } from "./useBabyTouch";
import { useBabyTouchOrientation } from "./useBabyTouchOrientation";

type BabyTouchScreen = "home" | "game" | "gallery";

const screen = ref<BabyTouchScreen>("home");
const chrome = useAppChrome({
  title: () => "Baby Touch",
  titlebar: () => "hidden",
});

const {
  handleParentCornerDown,
  handleParentCornerUp,
  playTapTone,
  settings,
  settingsLabel,
  updateSettings,
} = useBabyTouch({ onParentHoldComplete: returnHome });

const { forceLandscapeRight, orientationStyle, pointerMode, setOrientationViewport } =
  useBabyTouchOrientation();
const appClasses = computed(() => [
  `baby-touch--${screen.value}`,
  screen.value === "game" && `baby-touch--background-${settings.value.background}`,
  `baby-touch--${settings.value.intensity}`,
  forceLandscapeRight.value && "baby-touch--landscape-right",
]);
const selectedStickerSet = computed(
  () =>
    STICKER_SETS.find((stickerSet) => stickerSet.scene === settings.value.scene) ?? STICKER_SETS[0],
);
const homeSticker = computed(() => ({
  family: selectedStickerSet.value.family,
  kind: selectedStickerSet.value.featuredKind,
}));

function startWithBackground(next: BabyTouchBackground): void {
  updateSettings({ background: next });
  startGame();
}

function startGame(): void {
  screen.value = "game";
}

function openGallery(): void {
  screen.value = "gallery";
}

function pickScene(next: BabyTouchScene): void {
  updateSettings({ scene: next });
}

function returnHome(): void {
  screen.value = "home";
}

function hideApp(): void {
  chrome.hide?.();
}
</script>

<template>
  <AppFrame
    as="main"
    class="baby-touch"
    :class="appClasses"
    layout="block"
    :safe-area="false"
    aria-label="Baby Touch"
  >
    <div
      :ref="setOrientationViewport"
      class="baby-touch__orientation-viewport"
      :data-orientation-mode="pointerMode"
      data-testid="baby-touch-orientation-viewport"
      :style="orientationStyle"
    >
      <div class="baby-touch__orientation-frame">
        <BabyTouchHome
          v-if="screen === 'home'"
          :featured-sticker="homeSticker"
          @hide="hideApp"
          @open-gallery="openGallery"
          @pick-background="startWithBackground"
        />

        <BabyTouchGallery
          v-else-if="screen === 'gallery'"
          :selected-scene="settings.scene"
          @back="returnHome"
          @pick-scene="pickScene"
        />

        <BabyTouchPlaySurface
          v-else
          :handle-parent-corner-down="handleParentCornerDown"
          :handle-parent-corner-up="handleParentCornerUp"
          :play-tap-tone="playTapTone"
          :pointer-mode="pointerMode"
          :settings="settings"
          :settings-label="settingsLabel"
          @home="returnHome"
        />
      </div>
    </div>
  </AppFrame>
</template>

<style lang="scss" src="./styles/baby-touch.scss"></style>
