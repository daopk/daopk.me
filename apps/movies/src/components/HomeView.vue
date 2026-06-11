<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { ScrollArea, SegmentedControl, StatusBanner } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ChevronRight } from "@daopk/icons";

import HomeHero from "./HomeHero.vue";
import MovieCard from "./MovieCard.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import {
  homeGroupTitle,
  homePeriodOptions,
  homeRowTitle,
  mediaLabel,
  moviesText,
  rowListLabel,
} from "../i18n/labels";
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
  createMoviesPlaybackProgressStore,
  moviesPlaybackProgressRecords,
  type MoviesPlaybackProgressEntry,
  type MoviesPlaybackProgressRecord,
} from "../moviesPlaybackProgress";

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
  readonly progress: MoviesPlaybackProgressEntry;
  readonly progressPercent: number;
  readonly subtitle: string;
  readonly target: ContinueWatchingMovieTarget | ContinueWatchingEpisodeTarget;
  readonly title: string;
}

const emit = defineEmits<{
  "open-continue-episode": [request: MovieEpisodeTarget];
  "open-continue-movie": [movie: MovieSummary];
  "open-detail": [movie: MovieSummary];
  "open-list": [query: MoviesListQuery];
}>();

const CONTINUE_WATCHING_LIMIT = 10;

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
const playbackProgressStore = createMoviesPlaybackProgressStore();

const hasFeatured = computed(() => featured.value.length > 0);
const hasContinueWatching = computed(() => continueWatchingItems.value.length > 0);
const hasHomeContent = hasFeatured;

watch(
  locale,
  () => {
    void loadHome();
    void loadContinueWatching();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
  continueAbortController?.abort();
  playbackProgressStore.dispose();
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
  } catch (error) {
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

  const records = uniqueContinueWatchingRecords(
    moviesPlaybackProgressRecords(playbackProgressStore.snapshot()),
  );
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
  records: readonly MoviesPlaybackProgressRecord[],
): readonly MoviesPlaybackProgressRecord[] {
  const seen = new Set<string>();
  const uniqueRecords: MoviesPlaybackProgressRecord[] = [];

  for (const record of records) {
    const groupKey =
      record.target.kind === "movie"
        ? `movie:${record.target.tmdbId}`
        : `tv:${record.target.tmdbId}`;
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
  record: MoviesPlaybackProgressRecord,
  signal: AbortSignal,
): Promise<ContinueWatchingItem | null> {
  if (record.target.kind === "movie") {
    const movie = await fetchMovieDetail("movie", record.target.tmdbId, { signal });
    return {
      id: record.key,
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
    id: record.key,
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

function continueProgressPercent(progress: MoviesPlaybackProgressEntry): number {
  if (!Number.isFinite(progress.currentTime) || !Number.isFinite(progress.duration)) {
    return 0;
  }

  return Math.round(Math.min(1, Math.max(0, progress.currentTime / progress.duration)) * 100);
}

function continueProgressWidth(item: ContinueWatchingItem): string {
  return `${item.progressPercent}%`;
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
    emit("open-continue-movie", item.target.movie);
    return;
  }

  emit("open-continue-episode", item.target.episode);
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
</script>

<template>
  <ScrollArea class="movies-home" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading' && !hasHomeContent" />

    <StatusBanner
      v-else-if="state === 'error' && !hasHomeContent"
      class="movies-home__status"
      tone="error"
      role="alert"
    >
      {{ t("movies.error.homeData") }}
    </StatusBanner>

    <HomeHero v-if="hasFeatured" :featured="featured" @open-detail="$emit('open-detail', $event)" />

    <section
      v-if="hasFeatured || hasContinueWatching"
      class="movies-home__rows-shell"
      :aria-label="t('movies.home.sections.ariaLabel')"
    >
      <div class="movies-home__rows">
        <section
          v-if="hasContinueWatching"
          class="movies-home__continue"
          aria-labelledby="movies-home-continue-title"
        >
          <div class="movies-home__continue-header">
            <h2 id="movies-home-continue-title">{{ t("movies.home.continue.title") }}</h2>
          </div>

          <ul class="movies-home__continue-rail">
            <li
              v-for="item in continueWatchingItems"
              :key="item.id"
              class="movies-home__continue-item"
            >
              <button
                type="button"
                class="movies-home__continue-card"
                :aria-label="continueAriaLabel(item)"
                @click="openContinueWatchingItem(item)"
              >
                <span class="movies-home__continue-media">
                  <img
                    v-if="item.imageUrl"
                    class="movies-home__continue-image"
                    :src="item.imageUrl"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                  />
                  <span v-else class="movies-home__continue-image" aria-hidden="true" />
                  <span class="movies-home__continue-badge">{{ continueKindLabel(item) }}</span>
                  <span class="movies-home__continue-progress" aria-hidden="true">
                    <span
                      class="movies-home__continue-progress-value"
                      :style="{ inlineSize: continueProgressWidth(item) }"
                    />
                  </span>
                </span>

                <span class="movies-home__continue-body">
                  <span class="movies-home__continue-title">{{ item.title }}</span>
                  <span v-if="item.subtitle" class="movies-home__continue-subtitle">
                    {{ item.subtitle }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <template v-if="hasFeatured">
          <section
            v-for="group in HOME_DISCOVERY_GROUPS"
            :key="group.id"
            class="movies-home__group"
          >
            <div class="movies-home__group-header">
              <h2>{{ homeGroupTitle(group, t) }}</h2>
              <SegmentedControl
                v-if="group.periodOptions"
                class="movies-home__period-control"
                :label="t('movies.home.periodControlLabel', { group: homeGroupTitle(group, t) })"
                :model-value="groupPeriodValue(group)"
                :options="homePeriodOptions(group, t)"
                size="sm"
                @change="setGroupPeriod(group, $event)"
              />
            </div>

            <div class="movies-home__group-rows">
              <section v-for="row in group.rows" :key="row.id" class="movies-home__row">
                <div class="movies-home__row-header">
                  <h3>{{ homeRowTitle(row, t) }}</h3>
                  <Button
                    class="movies-home__row-action"
                    size="sm"
                    variant="ghost"
                    :icon-start="ChevronRight"
                    :aria-label="t('movies.home.viewAll', { label: rowListLabel(group, row, t) })"
                    @click="$emit('open-list', queryForRow(group, row))"
                  />
                </div>

                <ul class="movies-home__rail">
                  <li
                    v-for="movie in rows[row.id] ?? []"
                    :key="movie.id"
                    class="movies-home__rail-item"
                  >
                    <MovieCard :movie="movie" @open="$emit('open-detail', $event)" />
                  </li>
                </ul>
              </section>
            </div>
          </section>
        </template>
      </div>
    </section>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-home {
  --movies-home-bg-base: #282b3a;
  --movies-home-bg-bridge: #30313a;
  --movies-home-bg-deep: color-mix(in srgb, var(--movies-home-bg-base) 82%, var(--color-bg));
  --movies-home-bg-lift: color-mix(in srgb, var(--movies-home-bg-base) 94%, var(--color-fg));
  --movies-home-bg-top: var(--movies-home-bg-bridge);
  --movies-card-edge-base: var(--movies-home-bg-deep);

  background:
    radial-gradient(
      120% 70% at 8% 0%,
      color-mix(in srgb, var(--movies-home-bg-lift) 54%, transparent) 0%,
      transparent 58%
    ),
    radial-gradient(
      88% 52% at 100% 26%,
      color-mix(in srgb, var(--color-accent) 14%, transparent) 0%,
      transparent 62%
    ),
    linear-gradient(
      180deg,
      var(--movies-home-bg-top) 0%,
      color-mix(in srgb, var(--movies-home-bg-top) 52%, var(--movies-home-bg-base)) 30%,
      var(--movies-home-bg-base) 52%,
      var(--movies-home-bg-deep) 100%
    );
  block-size: 100%;
  position: relative;
}

.movies-home__status {
  box-sizing: border-box;
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    auto 0;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding-inline: var(--movies-content-outer-padding-inline, var(--space-md));
}

.movies-home__rows-shell {
  background:
    radial-gradient(
      100% 38% at 12% 18%,
      color-mix(in srgb, var(--movies-home-bg-lift) 28%, transparent) 0%,
      transparent 70%
    ),
    radial-gradient(
      78% 42% at 100% 24%,
      color-mix(in srgb, var(--color-accent) 8%, transparent) 0%,
      transparent 68%
    ),
    linear-gradient(
      180deg,
      var(--movies-home-bg-top) 0%,
      color-mix(in srgb, var(--movies-home-bg-top) 58%, var(--movies-home-bg-base)) 22%,
      var(--movies-home-bg-base) 46%,
      var(--movies-home-bg-deep) 100%
    );
  padding: var(--space-lg)
    var(--movies-content-outer-padding-inline, clamp(var(--space-xl), 5vw, 72px)) var(--space-xl);
}

.movies-home__rows {
  display: grid;
  gap: clamp(var(--space-xl), 5vw, 64px);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-max-inline-size, 1296px);
}

.movies-home__group {
  display: grid;
  gap: var(--space-md);
}

.movies-home__continue {
  display: grid;
  gap: var(--space-sm);
}

.movies-home__continue-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.movies-home__continue-header h2 {
  font-size: var(--font-size-2xl);
  margin: 0;
}

.movies-home__continue-rail {
  display: grid;
  gap: var(--space-md);
  grid-auto-columns: minmax(230px, 300px);
  grid-auto-flow: column;
  list-style: none;
  margin: 0;
  overflow-x: auto;
  padding: var(--space-xs) 0 var(--space-sm);
  scrollbar-width: none;
}

.movies-home__continue-rail::-webkit-scrollbar {
  display: none;
}

.movies-home__continue-item {
  min-inline-size: 0;
}

.movies-home__continue-card {
  background: transparent;
  border: 0;
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-xs);
  inline-size: 100%;
  min-inline-size: 0;
  padding: 0;
  text-align: start;
}

.movies-home__continue-card:focus-visible {
  border-radius: var(--radius-md);
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.movies-home__continue-card:hover .movies-home__continue-image {
  transform: scale(1.035);
}

.movies-home__continue-media {
  aspect-ratio: 16 / 9;
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  display: block;
  overflow: hidden;
  position: relative;
}

.movies-home__continue-image {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition: transform var(--duration-base) var(--ease);
}

span.movies-home__continue-image {
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
}

.movies-home__continue-badge {
  background: color-mix(in srgb, var(--color-bg) 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 20%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-fg);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  inset-block-start: var(--space-xs);
  inset-inline-end: var(--space-xs);
  line-height: var(--leading-tight);
  max-inline-size: calc(100% - var(--space-md));
  overflow: hidden;
  padding: var(--space-2xs) var(--space-xs);
  position: absolute;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movies-home__continue-progress {
  background: color-mix(in srgb, var(--color-bg) 62%, transparent);
  block-size: 5px;
  inset-block-end: 0;
  inset-inline: 0;
  overflow: hidden;
  position: absolute;
}

.movies-home__continue-progress-value {
  background: var(--color-accent);
  block-size: 100%;
  display: block;
  inline-size: 0;
}

.movies-home__continue-body {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-home__continue-title,
.movies-home__continue-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movies-home__continue-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
}

.movies-home__continue-subtitle {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  line-height: var(--leading-snug);
}

.movies-home__group-header {
  align-items: center;
  display: flex;
  gap: var(--space-md);
  justify-content: flex-start;
}

.movies-home__group-header h2 {
  font-size: var(--font-size-2xl);
  margin: 0;
}

.movies-home__group-rows {
  display: grid;
  gap: var(--space-xl);
}

.movies-home__row {
  display: grid;
  gap: var(--space-sm);
}

.movies-home__row-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.movies-home__row-header h3 {
  font-size: var(--font-size-xl);
  margin: 0;
}

.movies-home__row-action {
  block-size: var(--control-height-sm);
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
  inline-size: var(--control-height-sm);
  padding: 0;
}

.movies-home__row-action:hover,
.movies-home__row-action:focus-visible {
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  color: var(--color-fg);
  text-decoration: none;
}

.movies-home__row-action :deep(.ds-button__icon) {
  block-size: 18px;
  inline-size: 18px;
}

.movies-home__rail {
  display: grid;
  gap: var(--space-md);
  grid-auto-columns: minmax(164px, 210px);
  grid-auto-flow: column;
  list-style: none;
  margin: 0;
  overflow-x: auto;
  padding: var(--space-xs) 0 var(--space-sm);
  scrollbar-width: none;
}

.movies-home__rail::-webkit-scrollbar {
  display: none;
}

.movies-home__rail-item {
  min-inline-size: 0;
}

@media (max-width: 760px) {
  .movies-home__rows-shell {
    padding-block: var(--space-lg) var(--space-xl);
  }

  .movies-home__rows {
    gap: var(--space-xl);
  }

  .movies-home__rail {
    grid-auto-columns: minmax(136px, 42vw);
  }

  .movies-home__continue-rail {
    grid-auto-columns: minmax(220px, 74vw);
  }
}

@media (max-width: 640px) {
  .movies-home__group-header {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .movies-home__continue-image {
    transition: none;
  }
}
</style>
