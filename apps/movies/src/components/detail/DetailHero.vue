<script setup vapor lang="ts">
import { computed, inject, ref, watch } from "vue";

import Play from "~icons/lucide/play";
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

watch([() => props.detail.mediaType, () => props.detail.tmdbId, () => props.trailerKey], () => {
  trailerEnded.value = false;
  trailerPlaying.value = false;
});

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

<style scoped lang="scss" src="../../styles/detail-hero.scss"></style>
