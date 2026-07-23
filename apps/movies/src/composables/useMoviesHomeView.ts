import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue";

import { mediaLabel, moviesText } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  fetchMovieDetail,
  fetchMovieEpisode,
  fetchMoviesList,
  HOME_DISCOVERY_GROUPS,
  type MovieEpisodeTarget,
  type MovieSummary,
  type MoviesListPeriod,
  type MoviesListQuery,
  type MoviesRowConfig,
  type MoviesRowGroupConfig,
} from "../moviesApi";
import {
  type MoviesContinueWatchingRecord,
  type MoviesWatchContinuity,
  type MoviesWatchProgress,
} from "../moviesWatchContinuity";

type LoadState = "loading" | "ready" | "error";
type PeriodGroupId = Extract<MoviesRowGroupConfig["id"], "trending">;

interface ContinueWatchingMovieTarget {
  readonly kind: "movie";
  readonly movie: MovieSummary;
}

interface ContinueWatchingEpisodeTarget {
  readonly episode: MovieEpisodeTarget;
  readonly kind: "episode";
}

interface ContinueWatchingItem {
  readonly id: string;
  readonly imageUrl: string;
  readonly progress: MoviesWatchProgress;
  readonly progressPercent: number;
  readonly subtitle: string;
  readonly target: ContinueWatchingMovieTarget | ContinueWatchingEpisodeTarget;
  readonly title: string;
}

interface UseMoviesHomeViewOptions {
  readonly closeTrailerPreviewNow: () => void;
  readonly openContinueEpisode: (request: MovieEpisodeTarget) => void;
  readonly openContinueMovie: (movie: MovieSummary) => void;
  readonly watchContinuity: MoviesWatchContinuity;
}

export interface UseMoviesHomeViewBindings {
  readonly continueWatchingItems: Ref<readonly ContinueWatchingItem[]>;
  readonly featured: Ref<readonly MovieSummary[]>;
  readonly hasContinueWatching: ComputedRef<boolean>;
  readonly hasFeatured: ComputedRef<boolean>;
  readonly hasHomeContent: ComputedRef<boolean>;
  readonly rows: Ref<Record<string, readonly MovieSummary[]>>;
  readonly state: Ref<LoadState>;
  readonly t: ReturnType<typeof useMoviesI18n>["t"];
  continueAriaLabel(item: ContinueWatchingItem): string;
  continueKindLabel(item: ContinueWatchingItem): string;
  continueProgressWidth(item: ContinueWatchingItem): string;
  groupPeriodValue(group: MoviesRowGroupConfig): string;
  openContinueWatchingItem(item: ContinueWatchingItem): void;
  queryForRow(group: MoviesRowGroupConfig, row: MoviesRowConfig): MoviesListQuery;
  removeContinueWatchingItem(item: ContinueWatchingItem): void;
  setGroupPeriod(group: MoviesRowGroupConfig, next: string): void;
}

const CONTINUE_WATCHING_LIMIT = 10;

export function useMoviesHomeView({
  closeTrailerPreviewNow,
  openContinueEpisode,
  openContinueMovie,
  watchContinuity,
}: UseMoviesHomeViewOptions): UseMoviesHomeViewBindings {
  const { locale, t } = useMoviesI18n();
  const continueWatchingItems = ref<readonly ContinueWatchingItem[]>([]);
  const featured = ref<readonly MovieSummary[]>([]);
  const rows = ref<Record<string, readonly MovieSummary[]>>({});
  const state = ref<LoadState>("loading");
  const selectedPeriods = ref<Record<PeriodGroupId, MoviesListPeriod>>({
    trending: "week",
  });

  let abortController: AbortController | null = null;
  let continueAbortController: AbortController | null = null;
  const hasFeatured = computed(() => featured.value.length > 0);
  const hasContinueWatching = computed(() => continueWatchingItems.value.length > 0);
  const hasHomeContent = hasFeatured;

  watch(
    locale,
    () => {
      closeTrailerPreviewNow();
      void loadHome();
      void loadContinueWatching();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    abortController?.abort();
    continueAbortController?.abort();
  });

  async function loadHome(): Promise<void> {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    state.value = "loading";
    const rowRequests = HOME_DISCOVERY_GROUPS.flatMap((group) =>
      group.rows.map((row) => ({ query: queryForRow(group, row), row })),
    );

    try {
      const [heroResult, ...rowResults] = await Promise.all([
        fetchMoviesList(
          { kind: "trending-movie", limit: 6, period: "week" },
          { signal: controller.signal },
        ),
        ...rowRequests.map(({ query }) =>
          fetchMoviesList({ ...query, limit: 12 }, { signal: controller.signal }),
        ),
      ]);

      featured.value = heroResult.items;
      rows.value = rowRequests.reduce<Record<string, readonly MovieSummary[]>>(
        (acc, request, index) => {
          acc[request.row.id] = rowResults[index]?.items ?? [];
          return acc;
        },
        {},
      );
      state.value = "ready";
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      state.value = "error";
    }
  }

  async function loadContinueWatching(): Promise<void> {
    continueAbortController?.abort();
    const controller = new AbortController();
    continueAbortController = controller;

    const records = uniqueContinueWatchingRecords(watchContinuity.continueWatching());
    if (records.length === 0) {
      continueWatchingItems.value = [];
      return;
    }

    const hydrated = await Promise.all(
      records.map(async (record) => {
        try {
          return await hydrateContinueWatchingRecord(record, controller.signal);
        } catch {
          return null;
        }
      }),
    );

    if (controller.signal.aborted) {
      return;
    }

    continueWatchingItems.value = hydrated.filter(
      (item): item is ContinueWatchingItem => item !== null,
    );
  }

  function uniqueContinueWatchingRecords(
    records: readonly MoviesContinueWatchingRecord[],
  ): readonly MoviesContinueWatchingRecord[] {
    const seen = new Set<string>();
    const uniqueRecords: MoviesContinueWatchingRecord[] = [];

    for (const record of records) {
      const groupKey = continueWatchingRecordGroupKey(record);
      if (seen.has(groupKey)) {
        continue;
      }

      seen.add(groupKey);
      uniqueRecords.push(record);
      if (uniqueRecords.length >= CONTINUE_WATCHING_LIMIT) {
        break;
      }
    }

    return uniqueRecords;
  }

  async function hydrateContinueWatchingRecord(
    record: MoviesContinueWatchingRecord,
    signal: AbortSignal,
  ): Promise<ContinueWatchingItem | null> {
    if (record.target.kind === "movie") {
      const movie = await fetchMovieDetail("movie", record.target.tmdbId, { signal });
      return {
        id: `movie-${record.target.tmdbId}`,
        imageUrl: movie.backdropUrl || movie.thumbUrl || movie.posterUrl,
        progress: record.progress,
        progressPercent: continueProgressPercent(record.progress),
        subtitle: continueMovieSubtitle(movie),
        target: { kind: "movie", movie },
        title: movie.name,
      };
    }

    const episodeDetail = await fetchMovieEpisode(
      record.target.tmdbId,
      record.target.seasonNumber,
      record.target.episodeNumber,
      { signal },
    );
    const episodeTarget: MovieEpisodeTarget = {
      episodeNumber: episodeDetail.episode.episodeNumber,
      seasonNumber: episodeDetail.episode.seasonNumber,
      slug: episodeDetail.series.slug,
      tmdbId: episodeDetail.series.tmdbId,
    };

    return {
      id: `tv-${record.target.tmdbId}-s${record.target.seasonNumber}-e${record.target.episodeNumber}`,
      imageUrl:
        episodeDetail.episode.stillUrl ||
        episodeDetail.series.backdropUrl ||
        episodeDetail.series.thumbUrl ||
        episodeDetail.series.posterUrl,
      progress: record.progress,
      progressPercent: continueProgressPercent(record.progress),
      subtitle: continueEpisodeSubtitle(episodeDetail.episode.name, episodeTarget),
      target: { episode: episodeTarget, kind: "episode" },
      title: episodeDetail.series.name,
    };
  }

  function continueMovieSubtitle(movie: MovieSummary): string {
    return [movie.originName, movie.year]
      .filter((item): item is string | number => item !== "" && item !== null && item !== undefined)
      .join(" · ");
  }

  function continueEpisodeSubtitle(name: string, target: MovieEpisodeTarget): string {
    return [`S${target.seasonNumber} E${target.episodeNumber}`, name].filter(Boolean).join(" · ");
  }

  function continueProgressPercent(progress: MoviesWatchProgress): number {
    if (!Number.isFinite(progress.currentTime) || !Number.isFinite(progress.duration)) {
      return 0;
    }

    return Math.round(Math.min(1, Math.max(0, progress.currentTime / progress.duration)) * 100);
  }

  function continueProgressWidth(item: ContinueWatchingItem): string {
    return `${item.progressPercent}%`;
  }

  function continueWatchingRecordGroupKey(record: MoviesContinueWatchingRecord): string {
    return record.target.kind === "movie"
      ? `movie:${record.target.tmdbId}`
      : `tv:${record.target.tmdbId}`;
  }

  function continueWatchingItemGroupKey(item: ContinueWatchingItem): string {
    return item.target.kind === "movie"
      ? `movie:${item.target.movie.tmdbId}`
      : `tv:${item.target.episode.tmdbId}`;
  }

  function continueKindLabel(item: ContinueWatchingItem): string {
    return item.target.kind === "movie"
      ? mediaLabel("movie", t, "singular")
      : mediaLabel("tv", t, "short");
  }

  function continueAriaLabel(item: ContinueWatchingItem): string {
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

  function openContinueWatchingItem(item: ContinueWatchingItem): void {
    if (item.target.kind === "movie") {
      openContinueMovie(item.target.movie);
      return;
    }

    openContinueEpisode(item.target.episode);
  }

  function removeContinueWatchingItem(item: ContinueWatchingItem): void {
    const groupKey = continueWatchingItemGroupKey(item);
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

    continueWatchingItems.value = continueWatchingItems.value.filter(
      (current) => continueWatchingItemGroupKey(current) !== groupKey,
    );
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
    void loadHome();
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
