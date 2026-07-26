import { computed, ref, watch, type ComputedRef, type Ref } from "vue";

import { mediaLabel, moviesText } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  useMoviesHomeContent,
  type MoviesContentState,
  type MoviesContinueWatchingItem,
} from "../moviesContent";
import {
  type MovieEpisodeTarget,
  type MovieSummary,
  type MoviesListPeriod,
  type MoviesListQuery,
  type MoviesRowConfig,
  type MoviesRowGroupConfig,
} from "../moviesApi";
import type { MoviesWatchContinuity } from "../moviesWatchContinuity";

type PeriodGroupId = Extract<MoviesRowGroupConfig["id"], "trending">;

interface UseMoviesHomeViewOptions {
  readonly closeTrailerPreviewNow: () => void;
  readonly openContinueEpisode: (request: MovieEpisodeTarget) => void;
  readonly openContinueMovie: (movie: MovieSummary) => void;
  readonly watchContinuity: MoviesWatchContinuity;
}

export interface UseMoviesHomeViewBindings {
  readonly continueWatchingItems: ComputedRef<readonly MoviesContinueWatchingItem[]>;
  readonly featured: ComputedRef<readonly MovieSummary[]>;
  readonly hasContinueWatching: ComputedRef<boolean>;
  readonly hasFeatured: ComputedRef<boolean>;
  readonly hasHomeContent: ComputedRef<boolean>;
  readonly rows: ComputedRef<Readonly<Record<string, readonly MovieSummary[]>>>;
  readonly state: Readonly<Ref<MoviesContentState>>;
  readonly t: ReturnType<typeof useMoviesI18n>["t"];
  continueAriaLabel(item: MoviesContinueWatchingItem): string;
  continueKindLabel(item: MoviesContinueWatchingItem): string;
  continueProgressWidth(item: MoviesContinueWatchingItem): string;
  groupPeriodValue(group: MoviesRowGroupConfig): string;
  openContinueWatchingItem(item: MoviesContinueWatchingItem): void;
  queryForRow(group: MoviesRowGroupConfig, row: MoviesRowConfig): MoviesListQuery;
  removeContinueWatchingItem(item: MoviesContinueWatchingItem): void;
  setGroupPeriod(group: MoviesRowGroupConfig, next: string): void;
}

export function useMoviesHomeView({
  closeTrailerPreviewNow,
  openContinueEpisode,
  openContinueMovie,
  watchContinuity,
}: UseMoviesHomeViewOptions): UseMoviesHomeViewBindings {
  const { locale, t } = useMoviesI18n();
  const selectedPeriods = ref<Record<PeriodGroupId, MoviesListPeriod>>({
    trending: "week",
  });
  const resource = useMoviesHomeContent(
    () => selectedPeriods.value.trending,
    () => watchContinuity.continueWatching(),
  );
  const continueWatchingItems = computed(() => resource.content.value.continueWatchingItems);
  const featured = computed(() => resource.content.value.featured);
  const rows = computed(() => resource.content.value.rows);
  const { state } = resource;
  const hasFeatured = computed(() => featured.value.length > 0);
  const hasContinueWatching = computed(() => continueWatchingItems.value.length > 0);
  const hasHomeContent = hasFeatured;

  watch(locale, closeTrailerPreviewNow, { immediate: true });

  function continueProgressWidth(item: MoviesContinueWatchingItem): string {
    return `${item.progressPercent}%`;
  }

  function continueKindLabel(item: MoviesContinueWatchingItem): string {
    return item.target.kind === "movie"
      ? mediaLabel("movie", t, "singular")
      : mediaLabel("tv", t, "short");
  }

  function continueAriaLabel(item: MoviesContinueWatchingItem): string {
    return moviesText(
      t,
      "movies.home.continue.ariaLabel",
      "Continue {title}{subtitle}, {progress}% watched",
      {
        progress: item.progressPercent,
        subtitle: item.subtitle.length > 0 ? `, ${item.subtitle}` : "",
        title: item.title,
      },
    );
  }

  function openContinueWatchingItem(item: MoviesContinueWatchingItem): void {
    if (item.target.kind === "movie") {
      openContinueMovie(item.target.movie);
      return;
    }

    openContinueEpisode(item.target.episode);
  }

  function removeContinueWatchingItem(item: MoviesContinueWatchingItem): void {
    const target =
      item.target.kind === "movie"
        ? {
            kind: "movie" as const,
            slug: item.target.movie.slug,
            tmdbId: item.target.movie.tmdbId,
          }
        : {
            ...item.target.episode,
            kind: "episode" as const,
          };
    watchContinuity.removeFromContinueWatching(target);
    resource.refreshContinueWatching();
  }

  function groupPeriodValue(group: MoviesRowGroupConfig): string {
    return group.id === "trending" ? selectedPeriods.value[group.id] : "";
  }

  function isMoviesListPeriod(value: string): value is MoviesListPeriod {
    return value === "day" || value === "week";
  }

  function setGroupPeriod(group: MoviesRowGroupConfig, next: string): void {
    if (group.id !== "trending" || !isMoviesListPeriod(next)) {
      return;
    }

    if (selectedPeriods.value[group.id] === next) {
      return;
    }

    selectedPeriods.value = { ...selectedPeriods.value, [group.id]: next };
  }

  function queryForRow(group: MoviesRowGroupConfig, row: MoviesRowConfig): MoviesListQuery {
    const period = group.id === "trending" ? selectedPeriods.value[group.id] : undefined;
    return period === undefined ? row.query : { ...row.query, period };
  }

  return {
    continueAriaLabel,
    continueKindLabel,
    continueProgressWidth,
    continueWatchingItems,
    featured,
    groupPeriodValue,
    hasContinueWatching,
    hasFeatured,
    hasHomeContent,
    openContinueWatchingItem,
    queryForRow,
    removeContinueWatchingItem,
    rows,
    setGroupPeriod,
    state,
    t,
  };
}
