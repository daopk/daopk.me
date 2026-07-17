<script setup vapor lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import DetailContent from "./detail/DetailContent.vue";
import DetailHero from "./detail/DetailHero.vue";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  fetchMovieDetail,
  fetchMovieTrailer,
  type MovieDetail,
  type MovieEpisodeTarget,
  type MovieMediaType,
  type MoviePersonCredit,
  type MovieSeasonEpisode,
  type MovieSummary,
} from "../moviesApi";
import {
  createMoviesPlaybackProgressStore,
  moviePlaybackProgressKey,
  type MoviesPlaybackProgressEntry,
} from "../moviesPlaybackProgress";

type LoadState = "loading" | "ready" | "error";

interface DetailViewProps {
  mediaType: MovieMediaType;
  tmdbId: number;
}

const props = defineProps<DetailViewProps>();

const emit = defineEmits<{
  back: [];
  "open-detail": [movie: MovieSummary];
  "open-episode": [request: MovieEpisodeTarget];
  "open-person": [person: MoviePersonCredit];
  watch: [movie: MovieSummary];
}>();

const detail = ref<MovieDetail | null>(null);
const state = ref<LoadState>("loading");
const resumeProgress = ref<MoviesPlaybackProgressEntry | null>(null);
const trailerKey = ref<string | null>(null);
const { locale, t } = useMoviesI18n();
const playbackProgressStore = createMoviesPlaybackProgressStore();
let abortController: AbortController | null = null;

const progressKey = computed(() => moviePlaybackProgressKey(props.tmdbId));

watch(
  () => [props.mediaType, props.tmdbId, locale.value] as const,
  () => {
    void loadDetail();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
  playbackProgressStore.dispose();
});

async function loadDetail(): Promise<void> {
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;
  state.value = "loading";
  detail.value = null;
  resumeProgress.value = null;
  trailerKey.value = null;

  try {
    const [nextDetail, trailerResult] = await Promise.all([
      fetchMovieDetail(props.mediaType, props.tmdbId, {
        signal: controller.signal,
      }),
      fetchMovieTrailer(props.mediaType, props.tmdbId, {
        signal: controller.signal,
      }).catch(() => ({ trailer: null })),
    ]);
    if (controller.signal.aborted) {
      return;
    }
    detail.value = nextDetail;
    trailerKey.value = trailerResult.trailer?.key ?? null;
    refreshResumeProgress();
    state.value = "ready";
  } catch {
    if (controller.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

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
      ? playbackProgressStore.get(progressKey.value)
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
