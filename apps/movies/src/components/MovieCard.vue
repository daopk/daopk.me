<script setup lang="ts">
import { mediaLabel } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import type { MovieSummary } from "../moviesApi";
import PosterFrame from "./PosterFrame.vue";

interface MovieCardProps {
  movie: MovieSummary;
}

defineProps<MovieCardProps>();

defineEmits<{
  open: [movie: MovieSummary];
}>();

const { t } = useMoviesI18n();
</script>

<template>
  <button type="button" class="movie-card" @click="$emit('open', movie)">
    <PosterFrame
      class="movie-card__poster-wrap"
      :src="movie.posterUrl"
      :alt="movie.name"
      image-class="movie-card__poster"
      empty-class="movie-card__poster--empty"
    >
      <span class="movie-card__badge">
        {{ mediaLabel(movie.mediaType, t, movie.mediaType === "tv" ? "short" : "singular") }}
      </span>
    </PosterFrame>

    <span class="movie-card__body">
      <span class="movie-card__title">{{ movie.name }}</span>
      <span v-if="movie.originName || movie.year" class="movie-card__origin">
        {{ [movie.originName, movie.year].filter(Boolean).join(" · ") }}
      </span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.movie-card {
  background: transparent;
  border: 0;
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-xs);
  inline-size: 100%;
  min-inline-size: 0;
  padding: 0;
  text-align: start;
}

.movie-card:focus-visible {
  border-radius: var(--radius-md);
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.movie-card:hover :deep(.movies-poster-frame__image) {
  transform: scale(1.035);
}

.movie-card__badge {
  background: color-mix(in srgb, var(--color-bg) 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 20%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-fg);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  inset-block-start: var(--space-xs);
  inset-inline-end: var(--space-xs);
  max-inline-size: calc(100% - var(--space-md));
  overflow: hidden;
  padding: var(--space-2xs) var(--space-xs);
  position: absolute;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movie-card__body {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movie-card__title,
.movie-card__origin {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movie-card__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
}

.movie-card__origin {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  line-height: var(--leading-snug);
}

@media (prefers-reduced-motion: reduce) {
  .movie-card :deep(.movies-poster-frame__image) {
    transition: none;
  }
}
</style>
