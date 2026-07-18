<script setup vapor lang="ts">
import Play from "~icons/lucide/play";

import { useMoviesI18n } from "../i18n/useMoviesI18n";
import type { MovieSeasonEpisode } from "../moviesApi";
import { episodeLabel, episodeMetaLabel } from "./detail/detailFormatters";

interface EpisodeListProps {
  activeEpisodeNumber?: number | null;
  episodes: readonly MovieSeasonEpisode[];
  showMeta?: boolean;
}

withDefaults(defineProps<EpisodeListProps>(), {
  activeEpisodeNumber: null,
  showMeta: false,
});

defineEmits<{
  open: [episode: MovieSeasonEpisode];
}>();

const { t } = useMoviesI18n();
</script>

<template>
  <ol class="movies-episode-list">
    <li v-for="episode in episodes" :key="episode.id">
      <button
        type="button"
        class="movies-episode-list__item"
        :class="{
          'movies-episode-list__item--active':
            activeEpisodeNumber !== null && episode.episodeNumber === activeEpisodeNumber,
        }"
        @click="$emit('open', episode)"
      >
        <span class="movies-episode-list__media">
          <img
            v-if="episode.stillUrl"
            class="movies-episode-list__still"
            :src="episode.stillUrl"
            :alt="episode.name"
            loading="lazy"
            decoding="async"
          />
          <span v-else class="movies-episode-list__still" aria-hidden="true" />
          <span
            v-if="episode.play !== null"
            class="movies-episode-list__play-overlay"
            aria-hidden="true"
          >
            <Play />
          </span>
        </span>
        <span class="movies-episode-list__copy">
          <span class="movies-episode-list__label-row">
            <span class="movies-episode-list__label">{{ episodeLabel(episode, t) }}</span>
          </span>
          <strong>{{ episode.name }}</strong>
          <span v-if="showMeta && episodeMetaLabel(episode, t)" class="movies-episode-list__meta">
            {{ episodeMetaLabel(episode, t) }}
          </span>
          <span v-if="episode.overview" class="movies-episode-list__overview">
            {{ episode.overview }}
          </span>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped lang="scss">
.movies-episode-list {
  display: grid;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-episode-list__item {
  align-items: start;
  background: color-mix(in srgb, var(--color-fg) 3%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 9%, transparent);
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: var(--space-md);
  grid-template-columns: minmax(104px, 180px) minmax(0, 1fr);
  inline-size: 100%;
  min-block-size: 116px;
  overflow: hidden;
  padding: var(--space-sm);
  text-align: start;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.movies-episode-list__item--active {
  background: color-mix(in srgb, var(--color-accent) 7%, var(--color-fg) 3%);
  border-color: color-mix(in srgb, var(--color-accent) 48%, transparent);
}

.movies-episode-list__item:hover,
.movies-episode-list__item:focus-visible {
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 38%, transparent);
  box-shadow: var(--shadow-sm);
}

.movies-episode-list__item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.movies-episode-list__item:hover strong {
  color: var(--color-accent);
}

.movies-episode-list__media {
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  display: block;
  inline-size: 100%;
  overflow: hidden;
  position: relative;
}

.movies-episode-list__still {
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition:
    filter var(--duration-fast) var(--ease),
    transform var(--duration-base) var(--ease);
}

.movies-episode-list__item:hover .movies-episode-list__still,
.movies-episode-list__item:focus-visible .movies-episode-list__still {
  filter: brightness(0.68);
  transform: scale(1.035);
}

.movies-episode-list__play-overlay {
  align-items: center;
  backdrop-filter: blur(14px);
  background: rgb(8 9 13 / 66%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: var(--radius-full);
  block-size: 42px;
  color: #fff;
  display: inline-flex;
  inline-size: 42px;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  justify-content: center;
  opacity: 0;
  position: absolute;
  transform: translate(-50%, -50%) scale(0.9);
  transition:
    opacity var(--duration-fast) var(--ease),
    transform var(--duration-fast) var(--ease);
}

.movies-episode-list__play-overlay svg {
  block-size: 18px;
  inline-size: 18px;
  margin-inline-start: 2px;
}

.movies-episode-list__item:hover .movies-episode-list__play-overlay,
.movies-episode-list__item:focus-visible .movies-episode-list__play-overlay {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.movies-episode-list__copy {
  align-self: center;
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-episode-list__label-row {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-episode-list__label,
.movies-episode-list__meta {
  color: var(--color-fg-muted);
}

.movies-episode-list__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-episode-list__copy strong {
  font-size: var(--font-size-lg);
  line-height: var(--leading-snug);
  transition: color var(--duration-fast) var(--ease);
}

.movies-episode-list__overview {
  color: var(--color-fg-muted);
  display: -webkit-box;
  line-height: var(--leading-relaxed);
  max-inline-size: 72ch;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 700px) {
  .movies-episode-list__item {
    grid-template-columns: 1fr;
  }

  .movies-episode-list__copy {
    align-self: start;
  }
}
</style>
