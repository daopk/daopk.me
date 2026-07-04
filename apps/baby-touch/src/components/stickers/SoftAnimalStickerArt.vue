<script setup lang="ts">
import { computed } from "vue";

import type { BabyTouchSoftAnimalKind } from "../../babyTouchTypes";

const props = defineProps<{
  readonly kind: string;
}>();

const rawSoftAnimalStickerArt = import.meta.glob<string>("./soft-animals/*.png", {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

function getSoftAnimalKindFromPath(path: string): string {
  return path.match(/\/([^/]+)\.png$/)?.[1] ?? path;
}

const softAnimalStickerArt = Object.fromEntries(
  Object.entries(rawSoftAnimalStickerArt).map(([path, src]) => [
    getSoftAnimalKindFromPath(path),
    src,
  ]),
) as Partial<Record<BabyTouchSoftAnimalKind, string>>;

function isSoftAnimalKind(kind: string): kind is BabyTouchSoftAnimalKind {
  return Object.prototype.hasOwnProperty.call(softAnimalStickerArt, kind);
}

const resolvedSoftAnimalKind = computed<BabyTouchSoftAnimalKind>(() =>
  isSoftAnimalKind(props.kind) ? props.kind : "soft-animal-01",
);
const resolvedSoftAnimalSrc = computed<string>(
  () =>
    softAnimalStickerArt[resolvedSoftAnimalKind.value] ??
    softAnimalStickerArt["soft-animal-01"] ??
    "",
);
</script>

<template>
  <span class="baby-touch__sticker-art-host">
    <img
      class="baby-touch__sticker-art baby-touch__soft-animal"
      :class="`baby-touch__soft-animal--${resolvedSoftAnimalKind}`"
      :src="resolvedSoftAnimalSrc"
      alt=""
      draggable="false"
    />
  </span>
</template>
