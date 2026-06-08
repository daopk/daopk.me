import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";

import { useAppChrome } from "@daopk/kit";
import type { AppChromeBackAction, AppContext } from "@daopk/sdk";

import {
  listTitleForQuery,
  type MovieEpisodeTarget,
  type MoviePersonCredit,
  type MovieSummary,
  type MoviesListQuery,
} from "../moviesApi";
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
  moviesViewFromDeepLink,
  type MoviesView,
} from "../moviesRoutes";
import { replaceMoviesViewPath } from "../utils/moviesBrowserPath";

export interface UseMoviesNavigationOptions {
  readonly appContext: AppContext | null;
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
  currentPathname = browserPathname,
  syncPath = replaceMoviesViewPath,
}: UseMoviesNavigationOptions): UseMoviesNavigationBindings {
  const view = ref<MoviesView>(createMoviesHomeView());
  const history = ref<MoviesView[]>([]);
  const futureHistory = ref<MoviesView[]>([]);
  const toolbarSolid = ref(false);

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
  const chromeBackAction = computed<AppChromeBackAction | null>(() =>
    canGoBack.value ? { ariaLabel: "Back to Movies", handler: goBack } : null,
  );

  const appChrome = useAppChrome({ title: chromeTitle, backAction: chromeBackAction });
  const showCloseButton = computed(() => appChrome.available);

  onMounted(() => {
    openInitialDeepLink();
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
      syncPath(next);
      return;
    }

    history.value = [...history.value, view.value];
    futureHistory.value = [];
    view.value = next;
    syncPath(next);
  }

  function goBack(): void {
    const previous = history.value.at(-1);
    if (previous === undefined) {
      return;
    }

    history.value = history.value.slice(0, -1);
    futureHistory.value = [...futureHistory.value, view.value];
    view.value = previous;
    resetToolbarSolid();
    syncPath(previous);
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
    syncPath(next);
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
    navigate(movieWatchViewFromSummary(movie, { autoplay: options.autoplay }), options);
  }

  function openEpisodeWatch(request: MovieEpisodeTarget, options: MoviesWatchOptions = {}): void {
    navigate(movieEpisodeWatchViewFromTarget(request, { autoplay: options.autoplay }), options);
  }

  function openPerson(person: MoviePersonCredit): void {
    const next = moviePersonViewFromCredit(person);
    if (next !== null) {
      navigate(next);
    }
  }

  function openInitialDeepLink(): void {
    const intent = moviesDeepLinkFromInitialState(appContext?.args, currentPathname());
    if (intent === null) {
      return;
    }

    history.value = [];
    navigate(moviesViewFromDeepLink(intent), { replace: true });
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
