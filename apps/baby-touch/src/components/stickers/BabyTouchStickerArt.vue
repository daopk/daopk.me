<script setup vapor lang="ts">
import type { VaporComponent } from "vue";
import { computed } from "vue";

import type { BabyTouchFamily } from "../../babyTouchTypes";
import AnimalStickerArt from "./AnimalStickerArt.vue";
import SoftAnimalStickerArt from "./SoftAnimalStickerArt.vue";

const props = defineProps<{
  readonly family: BabyTouchFamily;
  readonly kind: string;
}>();

const stickerArtComponents: Record<BabyTouchFamily, VaporComponent> = {
  animal: AnimalStickerArt,
  "soft-animal": SoftAnimalStickerArt,
};

const stickerArtComponent = computed<VaporComponent>(() => stickerArtComponents[props.family]);
</script>

<template>
  <component :is="stickerArtComponent" :kind="kind" />
</template>
