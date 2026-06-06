<script setup lang="ts">
import type { MovieSummary } from "../moviesApi";

interface MovieCardProps {
  movie: MovieSummary;
}

defineProps<MovieCardProps>();

defineEmits<{
  open: [movie: MovieSummary];
}>();
</script>

<template>
  <button type="button" class="movie-card" @click="$emit('open', movie)">
    <span class="movie-card__poster-wrap">
      <img
        v-if="movie.posterUrl"
        class="movie-card__poster"
        :src="movie.posterUrl"
        :alt="movie.name"
        loading="lazy"
        decoding="async"
      />
      <span v-else class="movie-card__poster movie-card__poster--empty" aria-hidden="true" />
      <span class="movie-card__badge">
        {{ movie.mediaType === "tv" ? "TV" : "Movie" }}
      </span>
    </span>

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

.movie-card__poster-wrap {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: block;
  overflow: hidden;
  position: relative;
}

.movie-card__poster {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition: transform var(--duration-base) var(--ease);
}

.movie-card:hover .movie-card__poster {
  transform: scale(1.035);
}

.movie-card__poster--empty {
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
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
  .movie-card__poster {
    transition: none;
  }
}
</style>
