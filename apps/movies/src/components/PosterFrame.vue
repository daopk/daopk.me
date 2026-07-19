<script setup vapor lang="ts">
import { AspectRatio } from "@daopk/ui";

interface PosterFrameProps {
  alt?: string;
  decoding?: "async" | "auto" | "sync";
  emptyClass?: string;
  imageClass?: string;
  loading?: "eager" | "lazy";
  src?: string | null;
}

withDefaults(defineProps<PosterFrameProps>(), {
  alt: "",
  decoding: "async",
  emptyClass: "",
  imageClass: "",
  loading: "lazy",
  src: "",
});
</script>

<template>
  <AspectRatio class="movies-poster-frame" :ratio="2 / 3">
    <img
      v-if="src"
      class="movies-poster-frame__image"
      :class="imageClass"
      :src="src"
      :alt="alt"
      :loading="loading"
      :decoding="decoding"
    />
    <span
      v-else
      class="movies-poster-frame__image movies-poster-frame__image--empty"
      :class="[imageClass, emptyClass]"
      aria-hidden="true"
    >
      <slot name="empty" />
    </span>
    <slot />
  </AspectRatio>
</template>

<style scoped lang="scss">
.movies-poster-frame {
  --movie-card-edge-base: var(--movies-card-edge-base, var(--movies-surface-bg, var(--color-bg)));

  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  border-color: color-mix(in srgb, white 34%, var(--movie-card-edge-base))
    color-mix(in srgb, black 14%, var(--movie-card-edge-base))
    color-mix(in srgb, black 28%, var(--movie-card-edge-base))
    color-mix(in srgb, white 18%, var(--movie-card-edge-base));
  border-radius: var(--radius-md);
  border-style: solid;
  border-width: 1px;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 14%, transparent),
    inset 0 -1px 0 color-mix(in srgb, black 12%, transparent),
    0 1px 0 color-mix(in srgb, black 16%, var(--movie-card-edge-base)),
    0 4px 8px -8px color-mix(in srgb, black 28%, transparent);
  box-sizing: border-box;
  display: block;
  inline-size: 100%;
  overflow: hidden;
  position: relative;
}

.movies-poster-frame__image {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition: transform var(--duration-base) var(--ease);
}

.movies-poster-frame__image--empty {
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .movies-poster-frame__image {
    transition: none;
  }
}
</style>
