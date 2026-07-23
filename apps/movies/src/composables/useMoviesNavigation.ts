import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";

import { useAppChrome } from "@daopk/kit";
import type { AppChromeBackAction, AppContext, Kernel } from "@daopk/sdk";

import {
  type MovieEpisodeTarget,
  type MoviePersonCredit,
  type MovieSummary,
  type MoviesListQuery,
} from "../moviesApi";
import { localizedListTitleForQuery, moviesText } from "../i18n/labels";
import { useMoviesI18n, type MoviesTranslate } from "../i18n/useMoviesI18n";
import {
  createMoviesHomeView,
  createMoviesListView,
  createMoviesSearchView,
  movieDetailViewFromSummary,
  movieEpisodeViewFromTarget,
  movieEpisodeWatchViewFromTarget,
  moviePersonViewFromCredit,
  movieWatchViewFromSummary,
  moviesDeepLinkFromInitialState,
  moviesPathForView,
  moviesViewFromDeepLink,
  type MoviesView,
} from "../moviesRoutes";
import { replaceMoviesViewPath } from "../utils/moviesBrowserPath";

export interface UseMoviesNavigationOptions {
  readonly appContext: AppContext | null;
  readonly kernel?: Pick<Kernel, "events"> | null;
  readonly currentPathname?: () => string | null;
  readonly syncPath?: (view: MoviesView) => void;
}

interface MoviesReplaceOptions {
  readonly replace?: boolean;
}

interface MoviesWatchOptions extends MoviesReplaceOptions {
  readonly autoplay?: boolean;
}

export interface UseMoviesNavigationBindings {
  readonly activeSearch: ComputedRef<string>;
  readonly canGoBack: ComputedRef<boolean>;
  readonly canGoForward: ComputedRef<boolean>;
  readonly canGoHome: ComputedRef<boolean>;
  readonly showCloseButton: ComputedRef<boolean>;
  readonly toolbarSolid: Ref<boolean>;
  readonly view: Ref<MoviesView>;
  closeApp(): void;
  goBack(): void;
  goForward(): void;
  goHome(): void;
  openDetail(movie: MovieSummary, options?: MoviesReplaceOptions): void;
  openEpisode(request: MovieEpisodeTarget, options?: MoviesReplaceOptions): void;
  openEpisodeWatch(request: MovieEpisodeTarget, options?: MoviesWatchOptions): void;
  openMovieWatch(movie: MovieSummary, options?: MoviesWatchOptions): void;
  openList(query: MoviesListQuery, options?: { replace?: boolean }): void;
  openPerson(person: MoviePersonCredit): void;
  searchMovies(keyword: string, options?: { replace?: boolean }): void;
  updateToolbarSolid(event: Event): void;
}

export function useMoviesNavigation({
  appContext,
  kernel = null,
  currentPathname = browserPathname,
  syncPath = replaceMoviesViewPath,
}: UseMoviesNavigationOptions): UseMoviesNavigationBindings {
  const { t } = useMoviesI18n();
  const view = ref<MoviesView>(createMoviesHomeView());
  const history = ref<MoviesView[]>([]);
  const futureHistory = ref<MoviesView[]>([]);
  const toolbarSolid = ref(false);

  const canGoBack = computed(() => history.value.length > 0 || view.value.name !== "home");
  const canGoForward = computed(() => futureHistory.value.length > 0);
  const canGoHome = computed(() => view.value.name !== "home");
  const activeSearch = computed(() =>
    view.value.name === "list" ? (view.value.query.keyword ?? "") : "",
  );
  const chromeTitle = computed(() => {
    return chromeTitleForView(view.value, t);
  });
  const chromeBackAction = computed<AppChromeBackAction | null>(() =>
    canGoBack.value ? { ariaLabel: t("movies.action.backToMovies"), handler: goBack } : null,
  );

  const appChrome = useAppChrome({ title: chromeTitle, backAction: chromeBackAction });
  const showCloseButton = computed(() => appChrome.available);

  onMounted(() => {
    if (!openInitialDeepLink()) {
      syncViewPath(view.value);
    }
  });

  function resetToolbarSolid(): void {
    toolbarSolid.value = false;
  }

  function updateToolbarSolid(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;
    toolbarSolid.value = (target?.scrollTop ?? 0) > 32;
  }

  function navigate(next: MoviesView, options: { replace?: boolean } = {}): void {
    resetToolbarSolid();
    if (options.replace) {
      futureHistory.value = [];
      view.value = next;
      syncViewPath(next);
      return;
    }

    history.value = [...history.value, view.value];
    futureHistory.value = [];
    view.value = next;
    syncViewPath(next);
  }

  function goBack(): void {
    const previous = history.value.at(-1);
    if (previous === undefined) {
      if (view.value.name === "home") {
        return;
      }

      futureHistory.value = [...futureHistory.value, view.value];
      view.value = createMoviesHomeView();
      resetToolbarSolid();
      syncViewPath(view.value);
      return;
    }

    history.value = history.value.slice(0, -1);
    futureHistory.value = [...futureHistory.value, view.value];
    view.value = previous;
    resetToolbarSolid();
    syncViewPath(previous);
  }

  function goForward(): void {
    const next = futureHistory.value.at(-1);
    if (next === undefined) {
      return;
    }

    futureHistory.value = futureHistory.value.slice(0, -1);
    history.value = [...history.value, view.value];
    view.value = next;
    resetToolbarSolid();
    syncViewPath(next);
  }

  function closeApp(): void {
    appChrome.close();
  }

  function goHome(): void {
    if (view.value.name === "home") {
      return;
    }

    navigate(createMoviesHomeView());
  }

  function openList(query: MoviesListQuery, options: { replace?: boolean } = {}): void {
    navigate(createMoviesListView(query), options);
  }

  function searchMovies(keyword: string, options: { replace?: boolean } = {}): void {
    navigate(createMoviesSearchView(keyword), options);
  }

  function openDetail(movie: MovieSummary, options: MoviesReplaceOptions = {}): void {
    navigate(movieDetailViewFromSummary(movie), options);
  }

  function openEpisode(request: MovieEpisodeTarget, options: MoviesReplaceOptions = {}): void {
    navigate(movieEpisodeViewFromTarget(request), options);
  }

  function openMovieWatch(movie: MovieSummary, options: MoviesWatchOptions = {}): void {
    navigate(
      movieWatchViewFromSummary(movie, {
        autoplay: options.autoplay,
      }),
      options,
    );
  }

  function openEpisodeWatch(request: MovieEpisodeTarget, options: MoviesWatchOptions = {}): void {
    navigate(
      movieEpisodeWatchViewFromTarget(request, {
        autoplay: options.autoplay,
      }),
      options,
    );
  }

  function openPerson(person: MoviePersonCredit): void {
    const next = moviePersonViewFromCredit(person);
    if (next !== null) {
      navigate(next);
    }
  }

  function openInitialDeepLink(): boolean {
    const intent = moviesDeepLinkFromInitialState(appContext?.args, currentPathname());
    if (intent === null) {
      return false;
    }

    history.value = [];
    navigate(moviesViewFromDeepLink(intent), { replace: true });
    return true;
  }

  function syncViewPath(next: MoviesView): void {
    const path = moviesPathForView(next);
    syncPath(next);
    emitBrowserPath(path);
  }

  function emitBrowserPath(path: string): void {
    if (appContext === null || kernel === null) {
      return;
    }

    kernel.events.emit("app.url.changed", {
      manifestId: appContext.manifestId,
      handleId: appContext.handleId,
      path,
    });
  }

  return {
    activeSearch,
    canGoBack,
    canGoForward,
    canGoHome,
    showCloseButton,
    toolbarSolid,
    view,
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
    updateToolbarSolid,
  };
}

function browserPathname(): string | null {
  return typeof window === "undefined" ? null : window.location.pathname;
}

function chromeTitleForView(view: MoviesView, t?: MoviesTranslate): string {
  if (view.name === "list") {
    return localizedListTitleForQuery(view.query, t);
  }

  if (view.name === "detail") {
    return view.title ?? titleFromSlug(view.slug, t);
  }

  if (view.name === "watch") {
    if (view.target.kind === "movie") {
      return view.target.title ?? titleFromSlug(view.target.slug, t);
    }

    return (
      view.target.title ?? episodeTitleFromParts(view.target.slug, view.target.episodeNumber, t)
    );
  }

  if (view.name === "person") {
    return view.title ?? titleFromSlug(view.slug, t);
  }

  if (view.name === "season") {
    return (
      view.title ??
      `${titleFromSlug(view.slug, t)}: ${moviesText(t, "movies.format.season", "Season {number}", {
        number: view.seasonNumber,
      })}`
    );
  }

  if (view.name === "episode") {
    return view.title ?? episodeTitleFromParts(view.slug, view.episodeNumber, t);
  }

  return moviesText(t, "movies.app.ariaLabel", "Movies");
}

function episodeTitleFromParts(slug: string, episodeNumber: number, t?: MoviesTranslate): string {
  return `${titleFromSlug(slug, t)}: ${moviesText(t, "movies.format.episode", "Episode {number}", {
    number: episodeNumber,
  })}`;
}

function titleFromSlug(slug: string, t?: MoviesTranslate): string {
  const title = slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => (/^(?:tmdb|tv)$/i.test(part) ? part.toUpperCase() : capitalize(part)))
    .join(" ");

  return title.length > 0 ? title : moviesText(t, "movies.app.ariaLabel", "Movies");
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
