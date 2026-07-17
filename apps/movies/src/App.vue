<script setup vapor lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, useTemplateRef } from "vue";

import { AppFrame } from "@daopk/kit";
import { Button, Dialog, DialogActions } from "@daopk/ui";
import { Palette } from "@daopk/icons";
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
import { useMoviesThemeSuggestion } from "./composables/useMoviesThemeSuggestion";
import { useMoviesI18n } from "./i18n/useMoviesI18n";
import type { MovieEpisodeTarget, MoviesListQuery } from "./moviesApi";
import type { MoviesSourcePreferenceSnapshot } from "./moviesSourcePreference";

interface WatchViewInstance {
  readonly handleKeyboardEvent?: (event: KeyboardEvent) => void;
}

interface AppFrameRef {
  element: HTMLElement | null;
}

interface WatchEpisodeRequest {
  readonly sourcePreference: MoviesSourcePreferenceSnapshot | null;
  readonly target: MovieEpisodeTarget;
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

const darkThemeSuggestionPortalTarget = computed(() => rootElement.value ?? "body");
const {
  open: darkThemeSuggestionOpen,
  setOpen: setDarkThemeSuggestionOpen,
  switchSystemThemeToDark,
} = useMoviesThemeSuggestion({ kernel });

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

function openWatchEpisode(request: WatchEpisodeRequest): void {
  openEpisodeWatch(request.target, {
    autoplay: true,
    replace: true,
    sourcePreference: request.sourcePreference,
  });
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
      @open-detail="openDetail"
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
      :source-preference="view.sourcePreference ?? null"
      :target="view.target"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-detail="openDetail"
      @open-person="openPerson"
      @watch-episode="openWatchEpisode"
    />
    <PersonView
      v-else
      :tmdb-id="view.tmdbId"
      @scroll="updateToolbarSolid"
      @back="goBack"
      @open-detail="openDetail"
    />

    <Dialog
      :open="darkThemeSuggestionOpen"
      :title="t('movies.themeSuggestion.title')"
      :description="t('movies.themeSuggestion.description')"
      :portal-to="darkThemeSuggestionPortalTarget"
      scope="container"
      @update:open="setDarkThemeSuggestionOpen"
    >
      <DialogActions align="stretch">
        <Button type="button" variant="secondary" @click="setDarkThemeSuggestionOpen(false)">
          {{ t("movies.themeSuggestion.later") }}
        </Button>
        <Button
          class="movies-app__theme-suggestion-primary"
          type="button"
          variant="primary"
          :icon-start="Palette"
          @click="switchSystemThemeToDark"
        >
          {{ t("movies.themeSuggestion.switch") }}
        </Button>
      </DialogActions>
    </Dialog>
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
  --movies-card-edge-base: var(--movies-home-bg-deep);
  --movies-home-bg-base: color-mix(in srgb, var(--color-bg) 94%, var(--color-accent) 6%);
  --movies-home-bg-bridge: color-mix(
    in srgb,
    var(--color-bg-elevated) 88%,
    var(--color-accent) 12%
  );
  --movies-home-bg-deep: color-mix(in srgb, var(--movies-home-bg-base) 90%, var(--color-fg) 10%);
  --movies-home-bg-lift: color-mix(
    in srgb,
    var(--movies-home-bg-base) 74%,
    var(--color-bg-elevated) 26%
  );
  --movies-home-bg-top: var(--movies-home-bg-bridge);
  --movies-surface-bg: color-mix(in srgb, var(--color-bg) 96%, var(--color-accent) 4%);
  --movies-toolbar-control-bg: color-mix(in srgb, var(--color-bg-elevated) 78%, transparent);
  --movies-toolbar-control-bg-hover: color-mix(in srgb, var(--color-bg-elevated) 94%, transparent);
  --movies-toolbar-control-fg: color-mix(in srgb, var(--color-fg) 72%, transparent);
  --movies-toolbar-control-fg-strong: var(--color-fg);
  --movies-toolbar-solid-bg: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  --movies-toolbar-solid-border: color-mix(in srgb, var(--color-fg) 12%, transparent);
  --movies-toolbar-content-offset: calc(var(--control-height-md) + var(--space-xl));

  background: var(--movies-surface-bg);
  block-size: 100%;
  color: var(--color-fg);
  color-scheme: light;
  min-block-size: 0;
  overflow: hidden;
  position: relative;
}

:global([data-theme="dark"] .movies-app) {
  --color-bg: rgb(32 34 49);
  --color-bg-elevated: rgb(52 55 71);
  --color-bg-subtle: rgb(255 255 255 / 9%);
  --color-border: rgb(255 255 255 / 16%);
  --color-error-soft: rgb(255 157 157);
  --color-fg: rgb(247 247 251);
  --color-fg-muted: rgb(247 247 251 / 68%);
  --color-fg-subtle: rgb(247 247 251 / 48%);
  --movies-home-bg-base: rgb(40 43 58);
  --movies-home-bg-bridge: rgb(48 49 58);
  --movies-home-bg-deep: color-mix(in srgb, var(--movies-home-bg-base) 82%, var(--color-bg));
  --movies-home-bg-lift: color-mix(in srgb, var(--movies-home-bg-base) 94%, var(--color-fg));
  --movies-surface-bg: rgb(32 34 49);
  --movies-toolbar-control-bg: rgb(15 16 24 / 44%);
  --movies-toolbar-control-bg-hover: rgb(52 55 71 / 76%);
  --movies-toolbar-control-fg: rgb(247 247 251 / 76%);
  --movies-toolbar-control-fg-strong: rgb(247 247 251);
  --movies-toolbar-solid-bg: color-mix(in srgb, var(--color-bg) 76%, transparent);
  --movies-toolbar-solid-border: color-mix(in srgb, var(--color-fg) 12%, transparent);

  color-scheme: dark;
}

.movies-app :deep(img) {
  user-select: none;
  -webkit-user-drag: none;
}

.movies-app__theme-suggestion-primary {
  white-space: nowrap;
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
