<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, useTemplateRef } from "vue";

import { AppFrame } from "@daopk/kit";
import { AppContextInjectionKey, KernelInjectionKey } from "@daopk/sdk";

import DetailView from "./components/DetailView.vue";
import EpisodeView from "./components/EpisodeView.vue";
import HomeView from "./components/HomeView.vue";
import ListView from "./components/ListView.vue";
import MoviesToolbar from "./components/MoviesToolbar.vue";
import PersonView from "./components/PersonView.vue";
import SeasonView from "./components/SeasonView.vue";
import WatchView from "./components/WatchView.vue";
import { useMoviesNavigation } from "./composables/useMoviesNavigation";
import { useMoviesI18n } from "./i18n/useMoviesI18n";
import type { MoviesListQuery } from "./moviesApi";

type WatchViewInstance = InstanceType<typeof WatchView> & {
  readonly handleKeyboardEvent?: (event: KeyboardEvent) => void;
};

interface AppFrameRef {
  element: HTMLElement | null;
}

const ctx = inject(AppContextInjectionKey, null);
const kernel = inject(KernelInjectionKey, null);
const { t } = useMoviesI18n();
const rootRef = useTemplateRef<AppFrameRef>("rootRef");
const rootElement = computed(() => rootRef.value?.element ?? null);
const watchViewRef = ref<WatchViewInstance | null>(null);
const {
  activeSearch,
  canGoBack,
  canGoForward,
  canGoHome,
  closeApp,
  goBack,
  goForward,
  goHome,
  openDetail,
  openEpisode,
  openEpisodeWatch,
  openList,
  openMovieWatch,
  openPerson,
  searchMovies,
  showCloseButton,
  toolbarSolid,
  updateToolbarSolid,
  view,
} = useMoviesNavigation({ appContext: ctx, kernel });

function moviesAppRoot(): Element | null {
  return rootElement.value;
}

function shouldHandleMoviesKeyboardEvent(event: KeyboardEvent): boolean {
  if (typeof document === "undefined" || view.value.name !== "watch") {
    return false;
  }

  const root = moviesAppRoot();
  if (root === null || !document.contains(root)) {
    return false;
  }

  const target = event.target;
  return (
    !(target instanceof Node) ||
    target === document ||
    target === document.body ||
    root.contains(target)
  );
}

function onMoviesKeydown(event: KeyboardEvent): void {
  if (!shouldHandleMoviesKeyboardEvent(event)) {
    return;
  }

  watchViewRef.value?.handleKeyboardEvent?.(event);
}

function openToolbarList(query: MoviesListQuery): void {
  openList(query, { replace: view.value.name === "list" });
}

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onMoviesKeydown, { capture: true });
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", onMoviesKeydown, { capture: true });
  }
});
</script>

<template>
  <AppFrame
    ref="rootRef"
    class="movies-app"
    layout="grid"
    :safe-area="false"
    :aria-label="t('movies.app.ariaLabel')"
    @dragstart.prevent
  >
    <MoviesToolbar
      v-if="view.name !== 'watch'"
      :solid="toolbarSolid"
      :active-list-query="view.name === 'list' ? view.query : null"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      :can-go-home="canGoHome"
      :show-close="showCloseButton"
      :active-search="activeSearch"
      :search-dialog-container="rootElement"
      @back="goBack"
      @close="closeApp"
      @forward="goForward"
      @home="goHome"
      @open-list="openToolbarList"
      @search="searchMovies"
    />

    <HomeView
      v-if="view.name === 'home'"
      @scroll="updateToolbarSolid"
      @open-continue-movie="openMovieWatch($event, { autoplay: true })"
      @open-continue-episode="openEpisodeWatch($event, { autoplay: true })"
      @open-detail="openDetail"
      @open-list="openList"
    />
    <ListView
      v-else-if="view.name === 'list'"
      :query="view.query"
      @scroll="updateToolbarSolid"
      @open-detail="openDetail"
      @open-list="openList($event, { replace: true })"
    />
    <DetailView
      v-else-if="view.name === 'detail'"
      :media-type="view.mediaType"
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-detail="openDetail"
      @open-episode="openEpisode"
      @open-person="openPerson"
      @watch="openMovieWatch($event, { autoplay: true })"
    />
    <EpisodeView
      v-else-if="view.name === 'episode'"
      :episode-number="view.episodeNumber"
      :season-number="view.seasonNumber"
      :slug="view.slug"
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-episode="openEpisode($event, { replace: true })"
      @open-person="openPerson"
      @watch="openEpisodeWatch($event, { autoplay: true })"
    />
    <SeasonView
      v-else-if="view.name === 'season'"
      :season-number="view.seasonNumber"
      :slug="view.slug"
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-episode="openEpisode"
      @open-person="openPerson"
    />
    <WatchView
      v-else-if="view.name === 'watch'"
      ref="watchViewRef"
      :autoplay="view.autoplay === true"
      :target="view.target"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @watch-episode="openEpisodeWatch($event, { autoplay: true, replace: true })"
    />
    <PersonView
      v-else
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-detail="openDetail"
    />
  </AppFrame>
</template>

<style scoped lang="scss">
.movies-app {
  --movies-content-max-inline-size: 1296px;
  --movies-content-outer-padding-inline: clamp(var(--space-xl), 5vw, 72px);
  --movies-content-box-max-inline-size: calc(
    var(--movies-content-max-inline-size) + var(--movies-content-outer-padding-inline) +
      var(--movies-content-outer-padding-inline)
  );
  --movies-surface-bg: color-mix(in srgb, var(--color-bg) 84%, var(--color-fg) 16%);
  --movies-toolbar-content-offset: calc(var(--control-height-md) + var(--space-xl));

  background: var(--movies-surface-bg);
  block-size: 100%;
  color: var(--color-fg);
  min-block-size: 0;
  overflow: hidden;
  position: relative;
}

.movies-app :deep(img) {
  user-select: none;
  -webkit-user-drag: none;
}

@media (max-width: 1120px) {
  .movies-app {
    --movies-content-outer-padding-inline: var(--space-xl);
  }
}

@media (max-width: 760px) {
  .movies-app {
    --movies-content-outer-padding-inline: var(--space-md);
    --movies-toolbar-content-offset: calc(
      var(--mobile-shell-app-safe-area-top, 0px) + var(--control-height-md) + var(--space-xl)
    );
  }
}
</style>
