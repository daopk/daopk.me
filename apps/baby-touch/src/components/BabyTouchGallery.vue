<script setup lang="ts">
import { ArrowLeft } from "@daopk/icons";

import {
  babyTouchStickerCategories,
  type BabyTouchStickerCatalogItem,
} from "../babyTouchStickerCatalog";
import BabyTouchStickerArt from "./stickers/BabyTouchStickerArt.vue";

const emit = defineEmits<{
  (event: "back"): void;
}>();

function stickerStyle(sticker: BabyTouchStickerCatalogItem): Record<string, string> {
  return {
    "--baby-touch-hue": `${sticker.hue}deg`,
  };
}
</script>

<template>
  <section
    class="baby-touch__gallery"
    data-testid="baby-touch-gallery"
    aria-labelledby="baby-touch-gallery-title"
  >
    <header class="baby-touch__gallery-topbar">
      <button
        type="button"
        class="baby-touch__gallery-back"
        data-testid="baby-touch-gallery-back"
        aria-label="Back to Baby Touch home"
        @click="emit('back')"
      >
        <ArrowLeft :size="22" aria-hidden="true" />
      </button>

      <h1 id="baby-touch-gallery-title">Sticker Gallery</h1>
    </header>

    <div class="baby-touch__gallery-body">
      <section
        v-for="category in babyTouchStickerCategories"
        :key="category.id"
        class="baby-touch__gallery-category"
        data-testid="baby-touch-gallery-category"
        :aria-labelledby="`baby-touch-gallery-${category.id}`"
      >
        <header class="baby-touch__gallery-section-header">
          <h2 :id="`baby-touch-gallery-${category.id}`">{{ category.label }}</h2>
          <span class="baby-touch__gallery-count">{{ category.stickers.length }}</span>
        </header>

        <div class="baby-touch__gallery-grid">
          <article
            v-for="sticker in category.stickers"
            :key="sticker.id"
            class="baby-touch__gallery-card"
            data-testid="baby-touch-gallery-sticker"
          >
            <div
              class="baby-touch__gallery-art"
              :class="[
                `baby-touch__gallery-art--${sticker.family}`,
                `baby-touch__gallery-art--${sticker.kind}`,
              ]"
              :style="stickerStyle(sticker)"
              role="img"
              :aria-label="sticker.label"
            >
              <BabyTouchStickerArt :family="sticker.family" :kind="sticker.kind" />
            </div>

            <span class="baby-touch__gallery-label">{{ sticker.label }}</span>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>
