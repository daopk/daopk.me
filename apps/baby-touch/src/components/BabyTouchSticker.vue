<script setup lang="ts">
import { computed } from "vue";

import type { BabyTouchSticker } from "../babyTouchTypes";
import BabyTouchStickerArt from "./stickers/BabyTouchStickerArt.vue";

const { sticker } = defineProps<{
  readonly sticker: BabyTouchSticker;
}>();

const stickerStyle = computed<Record<string, string>>(() => ({
  "--baby-touch-x": `${sticker.x * 100}%`,
  "--baby-touch-y": `${sticker.y * 100}%`,
  "--baby-touch-hue": `${sticker.hue}deg`,
  "--baby-touch-spin": `${sticker.spin}deg`,
  "--baby-touch-scale": String(sticker.scale),
  "--baby-touch-mirror": sticker.mirror ? "-1" : "1",
  "--baby-touch-lifetime": `${sticker.lifetimeMs}ms`,
}));
</script>

<template>
  <div
    class="baby-touch__sticker"
    :class="[`baby-touch__sticker--${sticker.family}`, `baby-touch__sticker--${sticker.kind}`]"
    :style="stickerStyle"
    data-testid="baby-touch-sticker"
  >
    <BabyTouchStickerArt :family="sticker.family" :kind="sticker.kind" />

    <span class="baby-touch__sparkle baby-touch__sparkle--one" />
    <span class="baby-touch__sparkle baby-touch__sparkle--two" />
    <span class="baby-touch__sparkle baby-touch__sparkle--three" />
  </div>
</template>
