<script setup lang="ts">
import { LayoutGrid, Minimize2 } from "@daopk/icons";

import { backgroundOptions } from "../babyTouchBackgroundOptions";
import type { BabyTouchBackground } from "../babyTouchTypes";
import BabyTouchStickerArt from "./stickers/BabyTouchStickerArt.vue";

const emit = defineEmits<{
  (event: "hide"): void;
  (event: "open-gallery"): void;
  (event: "pick-background", value: BabyTouchBackground): void;
}>();
</script>

<template>
  <section class="baby-touch__home" data-testid="baby-touch-home">
    <button
      type="button"
      class="baby-touch__home-action baby-touch__gallery-open"
      data-testid="baby-touch-open-gallery"
      aria-label="Open sticker gallery"
      @click="emit('open-gallery')"
    >
      <LayoutGrid :size="22" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="baby-touch__home-action baby-touch__hide-app"
      data-testid="baby-touch-hide-app"
      aria-label="Hide app"
      @click="emit('hide')"
    >
      <Minimize2 :size="22" aria-hidden="true" />
    </button>

    <div class="baby-touch__home-brand">
      <div class="baby-touch__home-art" data-testid="baby-touch-home-art" aria-hidden="true">
        <BabyTouchStickerArt family="animal" kind="giraffe" />
      </div>
    </div>

    <div class="baby-touch__home-panel">
      <div class="baby-touch__background-grid" aria-label="Backgrounds">
        <button
          v-for="option in backgroundOptions"
          :key="option.value"
          type="button"
          class="baby-touch__background-option"
          :class="`baby-touch__background-option--${option.value}`"
          :aria-label="`Start with ${option.label} background`"
          data-testid="baby-touch-background-option"
          @click="emit('pick-background', option.value)"
        >
          <span class="baby-touch__background-preview" aria-hidden="true" />
        </button>
      </div>
    </div>
  </section>
</template>
