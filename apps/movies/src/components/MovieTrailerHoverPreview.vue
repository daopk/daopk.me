<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { AppPreviewInput } from "@daopk/sdk";
import { HoverCard } from "@daopk/ui";

import type {
  MovieTrailerPreviewAnchorMode,
  MovieTrailerPreviewReference,
} from "../composables/useMovieTrailerPreview";
import { mediaLabel } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import { fetchMovieTrailer, type MovieSummary, type MovieTrailerResult } from "../moviesApi";
import MovieTrailerPreviewCard from "./MovieTrailerPreviewCard.vue";

type TrailerPreviewState = "idle" | "loading" | "ready" | "error";

interface MovieTrailerHoverPreviewProps {
  anchorMode?: MovieTrailerPreviewAnchorMode;
  disabled?: boolean;
  movie: MovieSummary | null;
  portalTo?: string | HTMLElement;
  reference?: MovieTrailerPreviewReference;
  trailerCache?: Map<string, Promise<MovieTrailerResult>>;
}

const props = withDefaults(defineProps<MovieTrailerHoverPreviewProps>(), {
  anchorMode: "element",
  disabled: false,
  portalTo: "body",
  reference: undefined,
  trailerCache: undefined,
});

const emit = defineEmits<{
  "preview-enter": [];
  "preview-leave": [event: PointerEvent];
}>();

const localTrailerCache = new Map<string, Promise<MovieTrailerResult>>();
const emptyStyle: Record<string, string> = {};

const { locale, t } = useMoviesI18n();
const state = ref<TrailerPreviewState>("idle");
const trailerPreviewAspectRatio = ref<number | null>(null);
const trailerResult = ref<MovieTrailerResult | null>(null);

const cacheKey = computed(() =>
  props.movie === null ? null : `${locale.value}:${props.movie.mediaType}:${props.movie.tmdbId}`,
);
const open = computed(
  () => !props.disabled && props.movie !== null && props.reference !== undefined,
);
const centerPreviewOpen = computed(() => open.value && props.anchorMode === "center");
const hoverCardOpen = computed(() => open.value && props.anchorMode === "element");
const previewImageUrl = computed(() =>
  props.movie === null
    ? ""
    : props.movie.thumbUrl || props.movie.backdropUrl || props.movie.posterUrl,
);
const trailer = computed(() => trailerResult.value?.trailer ?? null);
const trailerPreviewInput = computed<AppPreviewInput | null>(() => {
  if (trailer.value === null) {
    return null;
  }

  return {
    kind: "url",
    url: `youtube-player://video/${encodeURIComponent(trailer.value.key)}?autoplay=1`,
  };
});
const trailerPreviewStyle = computed<Record<string, string>>(() => {
  const aspectRatio = trailerPreviewAspectRatio.value;
  if (aspectRatio === null) {
    return emptyStyle;
  }

  return {
    "--movies-trailer-preview-aspect-ratio": `${aspectRatio.toString()} / 1`,
  };
});
const metaLabel = computed(() => {
  if (props.movie === null) {
    return "";
  }

  return [
    mediaLabel(props.movie.mediaType, t, props.movie.mediaType === "tv" ? "short" : "singular"),
    props.movie.year,
  ]
    .filter((item): item is string | number => item !== "" && item !== null && item !== undefined)
    .join(" · ");
});
const previewLabel = computed(() =>
  props.movie === null
    ? t("movies.home.trailerPreview.unavailable")
    : t("movies.home.trailerPreview.ariaLabel", { title: props.movie.name }),
);
const centerPreviewStyle = computed<Record<string, string>>(() => {
  if (!centerPreviewOpen.value || props.reference === undefined) {
    return emptyStyle;
  }

  const rect = props.reference.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
    return emptyStyle;
  }

  return {
    "--movies-trailer-preview-center-x": `${centerX}px`,
    "--movies-trailer-preview-center-y": `${centerY}px`,
    transform: `translate3d(${centerX}px, ${centerY}px, 0) translate(-50%, -50%)`,
  };
});

watch(
  [cacheKey, open],
  ([nextKey, isOpen]) => {
    state.value = "idle";
    trailerPreviewAspectRatio.value = null;
    trailerResult.value = null;
    if (isOpen && nextKey !== null) {
      void loadTrailer(nextKey);
    }
  },
  { immediate: true },
);

async function loadTrailer(key: string): Promise<void> {
  const movie = props.movie;
  if (movie === null) {
    return;
  }

  const cache = props.trailerCache ?? localTrailerCache;
  state.value = "loading";

  let request = cache.get(key);
  if (request === undefined) {
    request = fetchMovieTrailer(movie.mediaType, movie.tmdbId).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, request);
  }

  try {
    const result = await request;
    if (cacheKey.value !== key) {
      return;
    }

    trailerResult.value = result;
    state.value = "ready";
  } catch {
    if (cacheKey.value === key) {
      state.value = "error";
      trailerResult.value = null;
    }
  }
}

function setTrailerPreviewAspectRatio(nextAspectRatio: number | null): void {
  if (nextAspectRatio === null || !Number.isFinite(nextAspectRatio) || nextAspectRatio <= 0) {
    trailerPreviewAspectRatio.value = null;
    return;
  }

  trailerPreviewAspectRatio.value = nextAspectRatio;
}
</script>

<template>
  <HoverCard
    v-if="anchorMode === 'element'"
    :open="hoverCardOpen"
    :disabled="disabled || movie === null || reference === undefined"
    :portal-to="portalTo"
    content-class="movies-trailer-hover-card__content"
    side="top"
    align="center"
    :open-delay="0"
    :close-delay="0"
    :prioritize-position="true"
    :reference="reference"
  >
    <span class="movies-trailer-hover-card__anchor" aria-hidden="true" />

    <template #content>
      <MovieTrailerPreviewCard
        v-if="movie !== null"
        :meta-label="metaLabel"
        :movie="movie"
        :preview-image-url="previewImageUrl"
        :preview-input="trailerPreviewInput"
        :preview-label="previewLabel"
        :preview-style="trailerPreviewStyle"
        :state="state"
        @aspect-ratio-change="setTrailerPreviewAspectRatio"
        @preview-enter="emit('preview-enter')"
        @preview-leave="emit('preview-leave', $event)"
      />
    </template>
  </HoverCard>
  <span v-else class="movies-trailer-hover-card__anchor" aria-hidden="true" />

  <Teleport v-if="centerPreviewOpen && movie !== null" :to="portalTo">
    <div class="movies-trailer-hover-card__center" :style="centerPreviewStyle">
      <MovieTrailerPreviewCard
        :meta-label="metaLabel"
        :movie="movie"
        :preview-image-url="previewImageUrl"
        :preview-input="trailerPreviewInput"
        :preview-label="previewLabel"
        :preview-style="trailerPreviewStyle"
        :state="state"
        @aspect-ratio-change="setTrailerPreviewAspectRatio"
        @preview-enter="emit('preview-enter')"
        @preview-leave="emit('preview-leave', $event)"
      />
    </div>
  </Teleport>
</template>

<style lang="scss">
.movies-trailer-hover-card__anchor {
  block-size: 1px;
  display: block;
  inline-size: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
}

.movies-trailer-hover-card__content {
  pointer-events: auto;
}

.movies-trailer-hover-card__center {
  inset-block-start: 0;
  inset-inline-start: 0;
  pointer-events: none;
  position: fixed;
  transition: transform 180ms var(--ease);
  transform: translate3d(0, 0, 0) translate(-50%, -50%);
  will-change: transform;
  z-index: var(--tooltip-z);
}

.movies-trailer-hover-card__center .movies-trailer-hover-card {
  animation: movies-trailer-hover-card-center-in 180ms var(--ease) both;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  pointer-events: none;
  transform-origin: center;
}

.movies-trailer-hover-card {
  --movies-trailer-preview-aspect-ratio: 16 / 9;

  background: color-mix(in srgb, var(--movies-home-bg-deep, var(--color-bg)) 88%, black 12%);
  color: var(--color-fg);
  display: grid;
  inline-size: min(380px, calc(100vw - var(--space-xl)));
  overflow: hidden;
}

.movies-trailer-hover-card__media {
  aspect-ratio: var(--movies-trailer-preview-aspect-ratio);
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  display: block;
  overflow: hidden;
  position: relative;
}

.movies-trailer-hover-card__image {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
}

.movies-trailer-hover-card__preview {
  block-size: 100%;
  inline-size: 100%;
}

span.movies-trailer-hover-card__image {
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
}

.movies-trailer-hover-card__status {
  align-items: center;
  background: color-mix(in srgb, black 54%, transparent);
  color: white;
  display: flex;
  inset: 0;
  justify-content: center;
  position: absolute;
}

.movies-trailer-hover-card__status--text {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
  padding: var(--space-md);
  text-align: center;
}

.movies-trailer-hover-card__body {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
  padding: var(--space-sm) var(--space-md) var(--space-md);
}

.movies-trailer-hover-card__body strong,
.movies-trailer-hover-card__body span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movies-trailer-hover-card__body strong {
  font-size: var(--font-size-sm);
  line-height: var(--leading-snug);
}

.movies-trailer-hover-card__body span {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  line-height: var(--leading-snug);
}

@keyframes movies-trailer-hover-card-center-in {
  from {
    opacity: 0;
    transform: scale(0.72);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .movies-trailer-hover-card__center {
    transition-duration: 0ms;
  }

  .movies-trailer-hover-card__center .movies-trailer-hover-card {
    animation-duration: 0ms;
  }
}
</style>
