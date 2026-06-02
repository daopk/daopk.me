<script setup lang="ts">
import type { Component } from "vue";
import { computed } from "vue";

import type { BabyTouchFamily } from "../../babyTouchTypes";
import AnimalStickerArt from "./AnimalStickerArt.vue";

const props = defineProps<{
  readonly family: BabyTouchFamily;
  readonly kind: string;
}>();

const stickerArtComponents: Record<BabyTouchFamily, Component> = {
  animal: AnimalStickerArt,
};

const stickerArtComponent = computed<Component>(() => stickerArtComponents[props.family]);
</script>

<template>
  <component :is="stickerArtComponent" :kind="kind" />
</template>
