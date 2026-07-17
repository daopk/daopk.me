<script setup vapor lang="ts">
import { computed } from "vue";

import type { BabyTouchAnimalKind } from "../../babyTouchTypes";

const props = defineProps<{
  readonly kind: string;
}>();

const rawAnimalStickerArt = import.meta.glob<string>("./animals/*.svg", {
  eager: true,
  import: "default",
  query: "?raw",
});

function getAnimalKindFromPath(path: string): string {
  return path.match(/\/([^/]+)\.svg$/)?.[1] ?? path;
}

function decorateAnimalArt(kind: string, art: string): string {
  return art.replace(
    /<svg\b/,
    `<svg class="baby-touch__sticker-art baby-touch__animal baby-touch__animal--${kind}" focusable="false" aria-hidden="true"`,
  );
}

const animalStickerArt = Object.fromEntries(
  Object.entries(rawAnimalStickerArt).map(([path, art]) => {
    const kind = getAnimalKindFromPath(path);
    return [kind, decorateAnimalArt(kind, art)];
  }),
) as Record<BabyTouchAnimalKind, string>;

function isAnimalKind(kind: string): kind is BabyTouchAnimalKind {
  return Object.prototype.hasOwnProperty.call(animalStickerArt, kind);
}

const resolvedAnimalArt = computed<string>(() =>
  isAnimalKind(props.kind) ? animalStickerArt[props.kind] : animalStickerArt.bear,
);
</script>

<template>
  <span class="baby-touch__sticker-art-host" v-html="resolvedAnimalArt" />
</template>
