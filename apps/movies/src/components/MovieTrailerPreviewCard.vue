<script setup lang="ts">
import { PreviewHost, Spinner } from "@daopk/kit";
import type { AppPreviewInput } from "@daopk/sdk";

import { useMoviesI18n } from "../i18n/useMoviesI18n";
import type { MovieSummary } from "../moviesApi";

type TrailerPreviewState = "idle" | "loading" | "ready" | "error";

interface MovieTrailerPreviewCardProps {
  metaLabel?: string;
  movie: MovieSummary;
  previewImageUrl?: string;
  previewInput: AppPreviewInput | null;
  previewLabel: string;
  previewStyle?: Record<string, string>;
  state: TrailerPreviewState;
}

withDefaults(defineProps<MovieTrailerPreviewCardProps>(), {
  metaLabel: "",
  previewImageUrl: "",
  previewStyle: () => ({}),
});

const emit = defineEmits<{
  "aspect-ratio-change": [nextAspectRatio: number | null];
  "preview-enter": [];
  "preview-leave": [event: PointerEvent];
}>();

const { t } = useMoviesI18n();
</script>

<template>
  <article
    class="movies-trailer-hover-card"
    :aria-label="previewLabel"
    :style="previewStyle"
    @pointerenter="emit('preview-enter')"
    @pointerleave="emit('preview-leave', $event)"
  >
    <div class="movies-trailer-hover-card__media">
      <PreviewHost
        v-if="previewInput !== null"
        class="movies-trailer-hover-card__preview"
        :input="previewInput"
        surface="movies.trailer"
        :fallback-title="t('movies.home.trailerPreview.unavailable')"
        fallback-description=""
        @aspect-ratio-change="emit('aspect-ratio-change', $event)"
      />
      <img
        v-else-if="previewImageUrl"
        class="movies-trailer-hover-card__image"
        :src="previewImageUrl"
        :alt="movie.name"
        loading="lazy"
        decoding="async"
      />
      <span v-else class="movies-trailer-hover-card__image" aria-hidden="true" />

      <span v-if="state === 'loading'" class="movies-trailer-hover-card__status">
        <Spinner size="md" :label="t('movies.home.trailerPreview.loading')" />
      </span>
      <span
        v-else-if="state === 'ready' && previewInput === null"
        class="movies-trailer-hover-card__status movies-trailer-hover-card__status--text"
      >
        {{ t("movies.home.trailerPreview.unavailable") }}
      </span>
      <span
        v-else-if="state === 'error'"
        class="movies-trailer-hover-card__status movies-trailer-hover-card__status--text"
      >
        {{ t("movies.home.trailerPreview.error") }}
      </span>
    </div>

    <div class="movies-trailer-hover-card__body">
      <strong>{{ movie.name }}</strong>
      <span v-if="metaLabel">{{ metaLabel }}</span>
    </div>
  </article>
</template>
