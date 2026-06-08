<script setup lang="ts">
import { getCurrentInstance, inject, onMounted, onUnmounted, ref } from "vue";

import { AppFrame } from "@daopk/kit";
import { AppContextInjectionKey } from "@daopk/sdk";

import DetailView from "./components/DetailView.vue";
import EpisodeView from "./components/EpisodeView.vue";
import HomeView from "./components/HomeView.vue";
import ListView from "./components/ListView.vue";
import MoviesToolbar from "./components/MoviesToolbar.vue";
import PersonView from "./components/PersonView.vue";
import WatchView from "./components/WatchView.vue";
import { useMoviesNavigation } from "./composables/useMoviesNavigation";

type WatchViewInstance = InstanceType<typeof WatchView> & {
  readonly handleKeyboardEvent?: (event: KeyboardEvent) => void;
};

const ctx = inject(AppContextInjectionKey, null);
const appInstance = getCurrentInstance();
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
} = useMoviesNavigation({ appContext: ctx });

function moviesAppRoot(): Element | null {
  const root = appInstance?.proxy?.$el;
  return root instanceof Element ? root : null;
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
    class="movies-app"
    layout="grid"
    :safe-area="false"
    aria-label="Movies"
    @dragstart.prevent
  >
    <MoviesToolbar
      v-if="view.name !== 'watch'"
      :solid="toolbarSolid"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      :can-go-home="canGoHome"
      :show-close="showCloseButton"
      :active-search="activeSearch"
      @back="goBack"
      @close="closeApp"
      @forward="goForward"
      @home="goHome"
      @search="searchMovies"
      @open-list="openList"
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

@media (max-width: 760px) {
  .movies-app {
    --movies-toolbar-content-offset: calc(
      var(--mobile-shell-app-safe-area-top, 0px) + var(--control-height-md) + var(--space-xl)
    );
  }
}
</style>
