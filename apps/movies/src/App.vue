<script setup lang="ts">
import { inject } from "vue";

import { AppFrame } from "@daopk/kit";
import { AppContextInjectionKey } from "@daopk/sdk";

import DetailView from "./components/DetailView.vue";
import EpisodeView from "./components/EpisodeView.vue";
import HomeView from "./components/HomeView.vue";
import ListView from "./components/ListView.vue";
import MoviesToolbar from "./components/MoviesToolbar.vue";
import PersonView from "./components/PersonView.vue";
import { useMoviesNavigation } from "./composables/useMoviesNavigation";

const ctx = inject(AppContextInjectionKey, null);
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
  openList,
  openPerson,
  searchMovies,
  showCloseButton,
  toolbarSolid,
  updateToolbarSolid,
  view,
} = useMoviesNavigation({ appContext: ctx });
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
      @open-continue-movie="openDetail($event, { autoplay: true })"
      @open-continue-episode="openEpisode($event, { autoplay: true })"
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
      :autoplay="view.autoplay === true"
      :media-type="view.mediaType"
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-detail="openDetail"
      @open-episode="openEpisode"
      @open-person="openPerson"
    />
    <EpisodeView
      v-else-if="view.name === 'episode'"
      :autoplay="view.autoplay === true"
      :episode-number="view.episodeNumber"
      :season-number="view.seasonNumber"
      :slug="view.slug"
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-episode="openEpisode($event, { replace: true })"
      @open-person="openPerson"
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
