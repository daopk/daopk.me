<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";

import { Play } from "@daopk/icons";
import { PreviewHost } from "@daopk/kit";
import { KernelInjectionKey, type AppPreviewInput, type AppPreviewSurface } from "@daopk/sdk";

import type { MovieDetail } from "../../moviesApi";
import type { MoviesPlaybackProgressEntry } from "../../moviesPlaybackProgress";
import { mediaLabel } from "../../i18n/labels";
import { useMoviesI18n } from "../../i18n/useMoviesI18n";
import { detailMetaLabel } from "./detailFormatters";

interface DetailHeroProps {
  detail: MovieDetail;
  resumeProgress?: MoviesPlaybackProgressEntry | null;
  trailerKey?: string | null;
}

const props = withDefaults(defineProps<DetailHeroProps>(), {
  resumeProgress: null,
  trailerKey: null,
});

defineEmits<{
  watch: [];
}>();

const { t } = useMoviesI18n();
const kernel = inject(KernelInjectionKey, null);
const trailerPreviewSurface: AppPreviewSurface = "movies.trailer";
const trailerEnded = ref(false);
const trailerPlaying = ref(false);
const detailMeta = computed(() => detailMetaLabel(props.detail, t));
const canWatch = computed(() => props.detail.mediaType === "movie" && props.detail.play !== null);
const playButtonLabel = computed(
  () =>
    `${props.resumeProgress === null ? t("movies.action.play") : t("movies.action.continue")} ${
      props.detail.name
    }`,
);
const hasTrailerKey = computed(
  () => typeof props.trailerKey === "string" && props.trailerKey.length > 0,
);
const trailerPreviewInput = computed<AppPreviewInput>(() => ({
  kind: "url",
  url: `youtube-player://video/${encodeURIComponent(props.trailerKey ?? "")}?autoplay=1&fit=cover`,
}));
const trailerPreviewResolution = computed(() =>
  hasTrailerKey.value && kernel !== null
    ? kernel.previews.resolve(trailerPreviewInput.value, { surface: trailerPreviewSurface })
    : null,
);
const shouldRenderTrailerPreview = computed(() => trailerPreviewResolution.value !== null);
const shouldShowTrailerPreview = computed(
  () => shouldRenderTrailerPreview.value && !trailerEnded.value,
);
const shouldRevealTrailerPreview = computed(
  () => shouldShowTrailerPreview.value && trailerPlaying.value,
);

watch(
  [() => props.detail.mediaType, () => props.detail.tmdbId, () => props.trailerKey],
  () => {
    trailerEnded.value = false;
    trailerPlaying.value = false;
  },
);

function revealTrailerAfterPlaybackStarts(): void {
  trailerPlaying.value = true;
}

function showCoverAfterTrailerEnd(): void {
  trailerEnded.value = true;
  trailerPlaying.value = false;
}
</script>

<template>
  <section class="movies-detail-hero" :class="{ 'movies-detail-hero--playable': canWatch }">
    <picture
      v-if="detail.backdropUrl || detail.posterUrl"
      class="movies-detail-hero__backdrop"
      aria-hidden="true"
    >
      <source v-if="detail.posterUrl" media="(max-width: 700px)" :srcset="detail.posterUrl" />
      <img :src="detail.backdropUrl || detail.posterUrl" alt="" />
    </picture>
    <div
      v-if="shouldShowTrailerPreview"
      class="movies-detail-hero__backdrop movies-detail-hero__trailer"
      :class="{ 'movies-detail-hero__trailer--visible': shouldRevealTrailerPreview }"
      aria-hidden="true"
    >
      <PreviewHost
        class="movies-detail-hero__trailer-preview"
        :input="trailerPreviewInput"
        :surface="trailerPreviewSurface"
        @ended="showCoverAfterTrailerEnd"
        @playing="revealTrailerAfterPlaybackStarts"
      />
    </div>
    <div class="movies-detail-hero__shade" />
    <div class="movies-detail-hero__content">
      <div class="movies-detail-hero__overview">
        <button
          v-if="detail.posterUrl && canWatch"
          type="button"
          class="movies-detail-hero__poster-shell movies-detail-hero__poster-shell--button"
          :aria-label="playButtonLabel"
          @click="$emit('watch')"
        >
          <img class="movies-detail-hero__poster" :src="detail.posterUrl" :alt="detail.name" />
          <span class="movies-detail-hero__play-overlay" aria-hidden="true">
            <Play />
          </span>
        </button>
        <span v-else-if="detail.posterUrl" class="movies-detail-hero__poster-shell">
          <img class="movies-detail-hero__poster" :src="detail.posterUrl" :alt="detail.name" />
        </span>
        <div class="movies-detail-hero__copy">
          <p class="movies-detail-hero__eyebrow">
            {{ t("movies.tmdbMedia", { media: mediaLabel(detail.mediaType, t, "singular") }) }}
          </p>
          <h1>{{ detail.name }}</h1>
          <p v-if="detail.originName" class="movies-detail-hero__origin">
            {{ detail.originName }}
          </p>
          <p v-if="detailMeta" class="movies-detail-hero__meta">{{ detailMeta }}</p>
          <p v-if="detail.content" class="movies-detail-hero__description">
            {{ detail.content }}
          </p>
          <div v-if="detail.genres.length > 0" class="movies-detail-hero__chips">
            <span v-for="item in detail.genres" :key="item.slug">{{ item.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.movies-detail-hero {
  background: var(--movies-surface-bg, var(--color-bg));
  min-block-size: 520px;
  overflow: hidden;
  padding: calc(var(--control-height-md) + var(--space-xl))
    var(--movies-content-outer-padding-inline, var(--space-lg)) var(--space-xl);
  position: relative;
}

.movies-detail-hero__backdrop,
.movies-detail-hero__shade {
  inset: 0;
  position: absolute;
}

.movies-detail-hero__backdrop,
.movies-detail-hero__backdrop img {
  block-size: 100%;
  inline-size: 100%;
}

.movies-detail-hero__backdrop img {
  display: block;
  object-fit: cover;
}

.movies-detail-hero__trailer {
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 420ms var(--ease);
}

.movies-detail-hero__trailer--visible {
  opacity: 1;
}

.movies-detail-hero__trailer-preview {
  block-size: 100%;
  inline-size: 100%;
}

.movies-detail-hero__shade {
  background:
    linear-gradient(
      to bottom,
      transparent 0%,
      transparent 34%,
      color-mix(in srgb, var(--movies-surface-bg, var(--color-bg)) 56%, transparent) 72%,
      color-mix(in srgb, var(--movies-surface-bg, var(--color-bg)) 94%, transparent) 100%
    ),
    linear-gradient(
      to right,
      color-mix(in srgb, var(--movies-surface-bg, var(--color-bg)) 42%, transparent),
      transparent 52%
    );
}

.movies-detail-hero__content {
  display: grid;
  gap: var(--space-lg);
  margin-inline: auto;
  max-inline-size: var(--movies-content-max-inline-size, 1296px);
  position: relative;
  z-index: 1;
}

.movies-detail-hero__overview {
  align-items: end;
  display: grid;
  gap: var(--space-xl);
  grid-template-columns: minmax(160px, 240px) minmax(0, 1fr);
}

.movies-detail-hero__poster-shell {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border: 0;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  color: inherit;
  display: block;
  inline-size: 100%;
  overflow: hidden;
  padding: 0;
  position: relative;
}

.movies-detail-hero__poster-shell--button {
  cursor: pointer;
}

.movies-detail-hero__poster-shell--button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}

.movies-detail-hero__poster {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition:
    filter var(--duration-fast) var(--ease),
    transform var(--duration-base) var(--ease);
}

.movies-detail-hero__poster-shell--button:hover .movies-detail-hero__poster,
.movies-detail-hero__poster-shell--button:focus-visible .movies-detail-hero__poster {
  filter: brightness(0.72);
  transform: scale(1.03);
}

.movies-detail-hero__play-overlay {
  align-items: center;
  backdrop-filter: blur(14px);
  background: rgb(8 9 13 / 66%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: var(--radius-full);
  block-size: 56px;
  color: #fff;
  display: inline-flex;
  inline-size: 56px;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  justify-content: center;
  position: absolute;
  transform: translate(-50%, -50%);
}

.movies-detail-hero__play-overlay svg {
  block-size: 22px;
  inline-size: 22px;
  margin-inline-start: 2px;
}

.movies-detail-hero__copy {
  display: grid;
  gap: var(--space-sm);
}

.movies-detail-hero__eyebrow,
.movies-detail-hero__origin,
.movies-detail-hero__meta,
.movies-detail-hero__description {
  margin: 0;
}

.movies-detail-hero__eyebrow {
  color: var(--color-accent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-detail-hero__copy h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-detail-hero__origin,
.movies-detail-hero__meta {
  color: var(--color-fg-muted);
}

.movies-detail-hero__description {
  line-height: var(--leading-relaxed);
  max-inline-size: 72ch;
}

.movies-detail-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.movies-detail-hero__chips span {
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-fg);
  font-size: var(--font-size-xs);
  padding: var(--space-2xs) var(--space-xs);
}

@media (prefers-reduced-motion: reduce) {
  .movies-detail-hero__trailer {
    transition: none;
  }
}

@media (max-width: 700px) {
  .movies-detail-hero {
    align-items: end;
    display: grid;
    min-block-size: min(680px, 76svh);
  }

  .movies-detail-hero__content {
    inline-size: 100%;
  }

  .movies-detail-hero__shade {
    background: linear-gradient(
      to bottom,
      transparent 0%,
      transparent 40%,
      color-mix(in srgb, var(--movies-surface-bg, var(--color-bg)) 58%, transparent) 76%,
      color-mix(in srgb, var(--movies-surface-bg, var(--color-bg)) 96%, transparent) 100%
    );
  }

  .movies-detail-hero__overview {
    align-items: end;
    grid-template-columns: 1fr;
  }

  .movies-detail-hero__poster-shell {
    display: none;
  }

  .movies-detail-hero--playable .movies-detail-hero__poster-shell {
    display: block;
    inline-size: min(180px, 44vw);
  }

  .movies-detail-hero__copy {
    align-self: end;
  }

  .movies-detail-hero__description,
  .movies-detail-hero__chips {
    display: none;
  }
}
</style>
