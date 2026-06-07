<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";

import { AppFrame, useAppChrome } from "@daopk/kit";
import { AppContextInjectionKey } from "@daopk/sdk";

import DetailView from "./components/DetailView.vue";
import EpisodeView from "./components/EpisodeView.vue";
import HomeView from "./components/HomeView.vue";
import ListView from "./components/ListView.vue";
import MoviesToolbar from "./components/MoviesToolbar.vue";
import PersonView from "./components/PersonView.vue";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
  listTitleForQuery,
  type MovieEpisodeTarget,
  type MovieMediaType,
  type MoviePersonCredit,
  type MovieSummary,
  type MoviesListQuery,
} from "./moviesApi";
import {
  replaceMovieDetailPath,
  replaceMovieEpisodePath,
  replaceMoviePersonPath,
  replaceMoviesAppPath,
} from "./utils/moviesBrowserPath";

type MoviesView =
  | { name: "home" }
  | { name: "list"; query: MoviesListQuery }
  | { name: "detail"; mediaType: MovieMediaType; slug: string; tmdbId: number }
  | {
      name: "episode";
      episodeNumber: number;
      seasonNumber: number;
      slug: string;
      tmdbId: number;
    }
  | { name: "person"; slug: string; tmdbId: number };

type MoviesDeepLink =
  | {
      readonly name: "detail";
      readonly mediaType: MovieMediaType;
      readonly slug?: string;
      readonly tmdbId: number;
    }
  | {
      readonly episodeNumber: number;
      readonly name: "episode";
      readonly seasonNumber: number;
      readonly slug?: string;
      readonly tmdbId: number;
    }
  | { readonly name: "person"; readonly slug?: string; readonly tmdbId: number };

const ctx = inject(AppContextInjectionKey, null);
const view = ref<MoviesView>({ name: "home" });
const history = ref<MoviesView[]>([]);
const futureHistory = ref<MoviesView[]>([]);
const homeToolbarSolid = ref(false);

const toolbarSolid = computed(() => view.value.name !== "home" || homeToolbarSolid.value);
const canGoBack = computed(() => history.value.length > 0);
const canGoForward = computed(() => futureHistory.value.length > 0);
const canGoHome = computed(() => view.value.name !== "home");
const activeSearch = computed(() =>
  view.value.name === "list" ? (view.value.query.keyword ?? "") : "",
);
const chromeTitle = computed(() => {
  if (view.value.name === "list") {
    return listTitleForQuery(view.value.query);
  }
  return "Movies";
});
const chromeBackAction = computed(() =>
  canGoBack.value ? { ariaLabel: "Back to Movies", handler: goBack } : null,
);

const appChrome = useAppChrome({ title: chromeTitle, backAction: chromeBackAction });
const showCloseButton = computed(() => appChrome.available);

onMounted(() => {
  openInitialDeepLink();
});

function replacePathForView(next: MoviesView): void {
  if (next.name === "detail") {
    replaceMovieDetailPath(next.mediaType, next.tmdbId, next.slug);
    return;
  }

  if (next.name === "person") {
    replaceMoviePersonPath(next.tmdbId, next.slug);
    return;
  }

  if (next.name === "episode") {
    replaceMovieEpisodePath(next.tmdbId, next.slug, next.seasonNumber, next.episodeNumber);
    return;
  }

  replaceMoviesAppPath();
}

function navigate(next: MoviesView, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    futureHistory.value = [];
    view.value = next;
    replacePathForView(next);
    return;
  }
  history.value = [...history.value, view.value];
  futureHistory.value = [];
  view.value = next;
  replacePathForView(next);
}

function goBack(): void {
  const previous = history.value.at(-1);
  if (previous === undefined) {
    return;
  }

  history.value = history.value.slice(0, -1);
  futureHistory.value = [...futureHistory.value, view.value];
  view.value = previous;
  if (previous.name === "home") {
    homeToolbarSolid.value = false;
  }
  replacePathForView(previous);
}

function goForward(): void {
  const next = futureHistory.value.at(-1);
  if (next === undefined) {
    return;
  }

  futureHistory.value = futureHistory.value.slice(0, -1);
  history.value = [...history.value, view.value];
  view.value = next;
  replacePathForView(next);
}

function closeApp(): void {
  appChrome.close();
}

function goHome(): void {
  if (view.value.name === "home") {
    return;
  }

  homeToolbarSolid.value = false;
  navigate({ name: "home" });
}

function openList(query: MoviesListQuery, options: { replace?: boolean } = {}): void {
  const nextQuery: MoviesListQuery = {
    ...query,
    limit: query.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
  };
  navigate({ name: "list", query: nextQuery }, options);
}

function searchMovies(keyword: string, options: { replace?: boolean } = {}): void {
  openList({ keyword, limit: DEFAULT_MOVIES_LIST_LIMIT, media: "all" }, options);
}

function openDetail(movie: MovieSummary): void {
  navigate({
    name: "detail",
    mediaType: movie.mediaType,
    slug: movie.slug,
    tmdbId: movie.tmdbId,
  });
}

function openEpisode(request: MovieEpisodeTarget, options: { replace?: boolean } = {}): void {
  navigate(
    {
      name: "episode",
      episodeNumber: request.episodeNumber,
      seasonNumber: request.seasonNumber,
      slug: request.slug,
      tmdbId: request.tmdbId,
    },
    options,
  );
}

function openPerson(person: MoviePersonCredit): void {
  if (person.tmdbId === null) {
    return;
  }

  navigate({
    name: "person",
    slug: slugFromText(person.name, `person-${person.tmdbId}`),
    tmdbId: person.tmdbId,
  });
}

function slugFromText(value: string, fallback = "person"): string {
  const slug = value
    .replace(/\u0110/g, "D")
    .replace(/\u0111/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug.length > 0 ? slug : fallback;
}

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function mediaTypeArg(value: unknown): MovieMediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function positiveIntegerArg(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && Number(number) > 0 ? Number(number) : null;
}

function nonNegativeIntegerArg(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && Number(number) >= 0 ? Number(number) : null;
}

function decodePathSegment(segment: string | undefined): string | null {
  if (segment === undefined) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}

function deepLinkFromPathname(pathname: string): MoviesDeepLink | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 && segments.length !== 6) {
    return null;
  }

  const mediaType = mediaTypeArg(segments[0]);
  const idSlug = decodePathSegment(segments[1]);
  if (idSlug === null) {
    return null;
  }

  const match = /^([1-9]\d*)-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/.exec(idSlug);
  if (match === null) {
    return null;
  }

  if (segments.length === 6) {
    if (mediaType !== "tv" || segments[2] !== "season" || segments[4] !== "episode") {
      return null;
    }

    const seasonNumber = nonNegativeIntegerArg(decodePathSegment(segments[3]));
    const episodeNumber = positiveIntegerArg(decodePathSegment(segments[5]));
    if (seasonNumber === null || episodeNumber === null) {
      return null;
    }

    return {
      episodeNumber,
      name: "episode",
      seasonNumber,
      slug: match[2],
      tmdbId: Number(match[1]),
    };
  }

  if (mediaType !== null) {
    return {
      mediaType,
      name: "detail",
      slug: match[2],
      tmdbId: Number(match[1]),
    };
  }

  if (segments[0] === "person") {
    return {
      name: "person",
      slug: match[2],
      tmdbId: Number(match[1]),
    };
  }

  return null;
}

function episodeDeepLinkFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): MoviesDeepLink | null {
  const mediaType = mediaTypeArg(args?.mediaType);
  const tmdbId = positiveIntegerArg(args?.tmdbId);
  const seasonNumber = nonNegativeIntegerArg(args?.seasonNumber);
  const episodeNumber = positiveIntegerArg(args?.episodeNumber);
  if (mediaType !== "tv" || tmdbId === null || seasonNumber === null || episodeNumber === null) {
    return null;
  }

  const slug = stringArg(args?.slug);
  return {
    episodeNumber,
    name: "episode",
    seasonNumber,
    tmdbId,
    ...(slug === null ? {} : { slug }),
  };
}

function detailDeepLinkFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): MoviesDeepLink | null {
  const mediaType = mediaTypeArg(args?.mediaType);
  const tmdbId = positiveIntegerArg(args?.tmdbId);
  if (mediaType === null || tmdbId === null) {
    return null;
  }

  const slug = stringArg(args?.slug);
  return {
    mediaType,
    name: "detail",
    tmdbId,
    ...(slug === null ? {} : { slug }),
  };
}

function deepLinkFromLaunchArgs(
  args: Readonly<Record<string, unknown>> | undefined,
): MoviesDeepLink | null {
  const personTmdbId = positiveIntegerArg(args?.personTmdbId);
  if (personTmdbId !== null) {
    const slug = stringArg(args?.slug);
    return { name: "person", tmdbId: personTmdbId, ...(slug === null ? {} : { slug }) };
  }

  const episodeIntent = episodeDeepLinkFromLaunchArgs(args);
  if (episodeIntent !== null) {
    return episodeIntent;
  }

  const detailIntent = detailDeepLinkFromLaunchArgs(args);
  if (detailIntent !== null) {
    return detailIntent;
  }

  const path = stringArg(args?.path);
  return path === null ? null : deepLinkFromPathname(path);
}

function initialDeepLink(): MoviesDeepLink | null {
  const launchIntent = deepLinkFromLaunchArgs(ctx?.args);
  if (launchIntent !== null) {
    return launchIntent;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return deepLinkFromPathname(window.location.pathname);
}

function openInitialDeepLink(): void {
  const intent = initialDeepLink();
  if (intent === null) {
    return;
  }

  history.value = [];
  if (intent.name === "detail") {
    navigate(
      {
        name: "detail",
        mediaType: intent.mediaType,
        slug: intent.slug ?? `tmdb-${intent.tmdbId}`,
        tmdbId: intent.tmdbId,
      },
      { replace: true },
    );
    return;
  }

  if (intent.name === "episode") {
    navigate(
      {
        name: "episode",
        episodeNumber: intent.episodeNumber,
        seasonNumber: intent.seasonNumber,
        slug: intent.slug ?? `tmdb-${intent.tmdbId}`,
        tmdbId: intent.tmdbId,
      },
      { replace: true },
    );
    return;
  }

  navigate(
    {
      name: "person",
      slug: intent.slug ?? `person-${intent.tmdbId}`,
      tmdbId: intent.tmdbId,
    },
    { replace: true },
  );
}
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
      @toolbar-solid="homeToolbarSolid = $event"
      @open-detail="openDetail"
      @open-list="openList"
    />
    <ListView
      v-else-if="view.name === 'list'"
      :query="view.query"
      @open-detail="openDetail"
      @open-list="openList($event, { replace: true })"
    />
    <DetailView
      v-else-if="view.name === 'detail'"
      :media-type="view.mediaType"
      :tmdb-id="view.tmdbId"
      @back="goBack"
      @open-detail="openDetail"
      @open-episode="openEpisode"
      @open-person="openPerson"
    />
    <EpisodeView
      v-else-if="view.name === 'episode'"
      :episode-number="view.episodeNumber"
      :season-number="view.seasonNumber"
      :slug="view.slug"
      :tmdb-id="view.tmdbId"
      @back="goBack"
      @open-episode="openEpisode($event, { replace: true })"
      @open-person="openPerson"
    />
    <PersonView v-else :tmdb-id="view.tmdbId" @back="goBack" @open-detail="openDetail" />
  </AppFrame>
</template>

<style scoped lang="scss">
.movies-app {
  --movies-toolbar-content-offset: calc(var(--control-height-md) + var(--space-xl));

  background: color-mix(in srgb, var(--color-bg) 70%, var(--color-fg) 30%);
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
