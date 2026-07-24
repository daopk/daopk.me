<script setup vapor lang="ts">
import { computed, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import ArrowLeft from "~icons/lucide/arrow-left";

import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import DetailContent from "./detail/DetailContent.vue";
import DetailHero from "./detail/DetailHero.vue";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  type MovieEpisodeTarget,
  type MovieMediaType,
  type MoviePersonCredit,
  type MovieSeasonEpisode,
  type MovieSummary,
} from "../moviesApi";
import { useMoviesContent } from "../moviesContent";
import type { MoviesWatchContinuity, MoviesWatchProgress } from "../moviesWatchContinuity";

interface DetailViewProps {
  mediaType: MovieMediaType;
  tmdbId: number;
  watchContinuity: MoviesWatchContinuity;
}

const props = defineProps<DetailViewProps>();

const emit = defineEmits<{
  back: [];
  "open-detail": [movie: MovieSummary];
  "open-episode": [request: MovieEpisodeTarget];
  "open-person": [person: MoviePersonCredit];
  watch: [movie: MovieSummary];
}>();

const resumeProgress = ref<MoviesWatchProgress | null>(null);
const { t } = useMoviesI18n();
const resource = useMoviesContent(
  () =>
    ({
      kind: "detail",
      mediaType: props.mediaType,
      tmdbId: props.tmdbId,
    }) as const,
);
const detail = computed(() => resource.content.value?.detail ?? null);
const trailerKey = computed(() => resource.content.value?.trailerKey ?? null);
const { state } = resource;

watch(detail, refreshResumeProgress);

function openEpisode(episode: MovieSeasonEpisode): void {
  if (detail.value === null) {
    return;
  }

  emit("open-episode", {
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    slug: detail.value.slug,
    tmdbId: detail.value.tmdbId,
  });
}

function refreshResumeProgress(): void {
  const currentDetail = detail.value;
  resumeProgress.value =
    currentDetail?.mediaType === "movie" && currentDetail.play !== null
      ? props.watchContinuity.progressFor({
          kind: "movie",
          slug: currentDetail.slug,
          tmdbId: currentDetail.tmdbId,
        })
      : null;
}

function startWatching(): void {
  refreshResumeProgress();
  const currentDetail = detail.value;
  if (currentDetail?.mediaType === "movie" && currentDetail.play !== null) {
    emit("watch", currentDetail);
  }
}
</script>

<template>
  <ScrollArea class="movies-detail" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-detail__status"
      role="alert"
      :title="t('movies.error.detail.title')"
      :description="t('movies.error.detail.description')"
    >
      <Button @click="$emit('back')">
        <template #left><ArrowLeft aria-hidden="true" /></template>
        {{ t("movies.action.back") }}
      </Button>
    </EmptyState>

    <template v-else-if="detail">
      <DetailHero
        :detail="detail"
        :resume-progress="resumeProgress"
        :trailer-key="trailerKey"
        @watch="startWatching"
      />
      <DetailContent
        :detail="detail"
        @open-detail="$emit('open-detail', $event)"
        @open-episode="openEpisode"
        @open-person="$emit('open-person', $event)"
      />
    </template>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-detail {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  position: relative;
}

.movies-detail__status {
  box-sizing: border-box;
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    auto 0;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding-inline: var(--movies-content-outer-padding-inline, var(--space-md));
}
</style>
