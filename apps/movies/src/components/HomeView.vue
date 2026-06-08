<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { ScrollArea, SegmentedControl, StatusBanner } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ChevronRight } from "@daopk/icons";

import MovieCard from "./MovieCard.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
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
type PeriodGroupId = Extract<MoviesRowGroupConfig["id"], "popular" | "trending">;

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
  readonly kindLabel: string;
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

const continueWatchingItems = ref<readonly ContinueWatchingItem[]>([]);
const featured = ref<readonly MovieSummary[]>([]);
const rows = ref<Record<string, readonly MovieSummary[]>>({});
const state = ref<LoadState>("loading");
const activeHeroIndex = ref(0);
const selectedPeriods = ref<Record<PeriodGroupId, MoviesListPeriod>>({
  popular: "week",
  trending: "week",
});

let abortController: AbortController | null = null;
let continueAbortController: AbortController | null = null;
const playbackProgressStore = createMoviesPlaybackProgressStore();

const activeHero = computed(
  () => featured.value[activeHeroIndex.value] ?? featured.value[0] ?? null,
);
const hasContinueWatching = computed(() => continueWatchingItems.value.length > 0);
const hasHomeContent = computed(() => activeHero.value !== null);

onMounted(() => {
  void loadHome();
  void loadContinueWatching();
});

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
    activeHeroIndex.value = 0;
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

  const records = moviesPlaybackProgressRecords(playbackProgressStore.snapshot(), {
    limit: CONTINUE_WATCHING_LIMIT,
  });
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

async function hydrateContinueWatchingRecord(
  record: MoviesPlaybackProgressRecord,
  signal: AbortSignal,
): Promise<ContinueWatchingItem | null> {
  if (record.target.kind === "movie") {
    const movie = await fetchMovieDetail("movie", record.target.tmdbId, { signal });
    return {
      id: record.key,
      imageUrl: movie.backdropUrl || movie.thumbUrl || movie.posterUrl,
      kindLabel: "Movie",
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
    kindLabel: "TV",
    progress: record.progress,
    progressPercent: continueProgressPercent(record.progress),
    subtitle: continueEpisodeSubtitle(episodeDetail.episode.name, episodeTarget),
    target: { episode: episodeTarget, kind: "episode" },
    title: episodeDetail.series.name,
  };
}

function onHeroScroll(event: Event): void {
  const rail = event.currentTarget as HTMLElement | null;
  if (rail === null || featured.value.length === 0) {
    return;
  }

  const slides = Array.from(rail.querySelectorAll<HTMLElement>("[data-hero-slide]"));
  if (slides.length === 0) {
    return;
  }

  const railCenter = rail.scrollLeft + rail.clientWidth / 2;
  const closest = slides.reduce(
    (current, slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - railCenter);
      return distance < current.distance ? { distance, index } : current;
    },
    { distance: Number.POSITIVE_INFINITY, index: activeHeroIndex.value },
  );

  if (closest.index !== activeHeroIndex.value) {
    activeHeroIndex.value = closest.index;
  }
}

function heroPosterUrl(movie: MovieSummary): string {
  return movie.posterUrl || movie.thumbUrl;
}

function heroKindLabel(movie: MovieSummary): string {
  return movie.mediaType === "tv" ? "TV" : "Movie";
}

function heroMetaLabel(movie: MovieSummary): string {
  return [movie.originName, movie.genres[0]?.name, movie.year]
    .filter((item): item is string | number => item !== "" && item !== null && item !== undefined)
    .join(" · ");
}

function heroRatingLabel(movie: MovieSummary): string {
  return movie.rating === null ? "" : `TMDB ${movie.rating.toFixed(1)}`;
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

function continueAriaLabel(item: ContinueWatchingItem): string {
  return `Continue ${item.title}${item.subtitle.length > 0 ? `, ${item.subtitle}` : ""}, ${
    item.progressPercent
  }% watched`;
}

function openContinueWatchingItem(item: ContinueWatchingItem): void {
  if (item.target.kind === "movie") {
    emit("open-continue-movie", item.target.movie);
    return;
  }

  emit("open-continue-episode", item.target.episode);
}

function groupPeriodValue(group: MoviesRowGroupConfig): string {
  return group.id === "popular" || group.id === "trending" ? selectedPeriods.value[group.id] : "";
}

function isMoviesListPeriod(value: string): value is MoviesListPeriod {
  return value === "day" || value === "month" || value === "week";
}

function setGroupPeriod(group: MoviesRowGroupConfig, next: string): void {
  if ((group.id !== "popular" && group.id !== "trending") || !isMoviesListPeriod(next)) {
    return;
  }

  if (selectedPeriods.value[group.id] === next) {
    return;
  }

  selectedPeriods.value = { ...selectedPeriods.value, [group.id]: next };
  void loadHome();
}

function queryForRow(group: MoviesRowGroupConfig, row: MoviesRowConfig): MoviesListQuery {
  const period =
    group.id === "popular" || group.id === "trending" ? selectedPeriods.value[group.id] : undefined;
  return period === undefined ? row.query : { ...row.query, period };
}

function rowListLabel(group: MoviesRowGroupConfig, row: MoviesRowConfig): string {
  return group.id === "current" ? row.title : `${group.title} ${row.title}`;
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
      Could not load Movies data. Try again later.
    </StatusBanner>

    <template v-if="activeHero">
      <section class="movies-home__hero" aria-label="Featured titles">
        <img
          v-if="activeHero.thumbUrl"
          class="movies-home__hero-backdrop"
          :src="activeHero.thumbUrl"
          alt=""
          aria-hidden="true"
        />
        <div class="movies-home__hero-edge" aria-hidden="true" />

        <div class="movies-home__hero-mobile">
          <ul
            class="movies-home__hero-slider"
            aria-label="Featured title slider"
            @scroll.passive="onHeroScroll"
          >
            <li
              v-for="(movie, index) in featured"
              :key="movie.id"
              class="movies-home__hero-slide"
              :class="{ 'movies-home__hero-slide--active': index === activeHeroIndex }"
              :data-hero-index="index"
              data-hero-slide
            >
              <button
                type="button"
                class="movies-home__hero-card"
                :aria-label="`Open ${movie.name}`"
                @click="$emit('open-detail', movie)"
              >
                <span class="movies-home__hero-poster-wrap">
                  <img
                    v-if="heroPosterUrl(movie)"
                    class="movies-home__hero-poster"
                    :src="heroPosterUrl(movie)"
                    alt=""
                    aria-hidden="true"
                    :loading="index === 0 ? 'eager' : 'lazy'"
                    decoding="async"
                  />
                  <span
                    v-else
                    class="movies-home__hero-poster movies-home__hero-poster--empty"
                    aria-hidden="true"
                  />
                  <span v-if="movie.year" class="movies-home__hero-chip">
                    {{ movie.year }}
                  </span>
                  <span class="movies-home__hero-chip movies-home__hero-chip--kind">
                    {{ heroKindLabel(movie) }}
                  </span>
                  <span v-if="heroRatingLabel(movie)" class="movies-home__hero-rating">
                    {{ heroRatingLabel(movie) }}
                  </span>
                </span>
              </button>
            </li>
          </ul>

          <div class="movies-home__hero-copy">
            <h1>{{ activeHero.name }}</h1>
            <p v-if="heroMetaLabel(activeHero)" class="movies-home__hero-meta">
              {{ heroMetaLabel(activeHero) }}
            </p>
          </div>
        </div>
      </section>
    </template>

    <section
      v-if="activeHero || hasContinueWatching"
      class="movies-home__rows"
      aria-label="Movies home sections"
    >
      <section
        v-if="hasContinueWatching"
        class="movies-home__continue"
        aria-labelledby="movies-home-continue-title"
      >
        <div class="movies-home__continue-header">
          <h2 id="movies-home-continue-title">Continue Watching</h2>
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
                <span class="movies-home__continue-badge">{{ item.kindLabel }}</span>
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

      <template v-if="activeHero">
        <section v-for="group in HOME_DISCOVERY_GROUPS" :key="group.id" class="movies-home__group">
          <div class="movies-home__group-header">
            <h2>{{ group.title }}</h2>
            <SegmentedControl
              v-if="group.periodOptions"
              class="movies-home__period-control"
              :label="`${group.title} period`"
              :model-value="groupPeriodValue(group)"
              :options="group.periodOptions"
              size="sm"
              @change="setGroupPeriod(group, $event)"
            />
          </div>

          <div class="movies-home__group-rows">
            <section v-for="row in group.rows" :key="row.id" class="movies-home__row">
              <div class="movies-home__row-header">
                <h3>{{ row.title }}</h3>
                <Button
                  class="movies-home__row-action"
                  size="sm"
                  variant="ghost"
                  :icon-start="ChevronRight"
                  :aria-label="`View all ${rowListLabel(group, row)}`"
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
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-md) 0;
}

.movies-home__hero {
  --movies-home-hero-fade-size: clamp(112px, 18vh, 220px);

  background: var(--movies-home-bg-top, var(--movies-surface-bg, var(--color-bg)));
  block-size: min(560px, 76vh);
  min-block-size: 320px;
  overflow: hidden;
  position: relative;
}

.movies-home__hero::after {
  background: linear-gradient(
    to bottom,
    transparent 0%,
    color-mix(
        in srgb,
        var(--movies-home-bg-top, var(--movies-surface-bg, var(--color-bg))) 18%,
        transparent
      )
      34%,
    color-mix(
        in srgb,
        var(--movies-home-bg-top, var(--movies-surface-bg, var(--color-bg))) 72%,
        transparent
      )
      74%,
    var(--movies-home-bg-top, var(--movies-surface-bg, var(--color-bg))) 100%
  );
  block-size: var(--movies-home-hero-fade-size);
  content: "";
  inset-block-end: -1px;
  inset-inline: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.movies-home__hero-backdrop {
  block-size: 100%;
  filter: saturate(1.04) contrast(1.02);
  inline-size: 100%;
  inset: 0;
  object-fit: cover;
  position: absolute;
  z-index: 0;
}

.movies-home__hero-edge {
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-bg) 74%, transparent) 0%,
      transparent 18%,
      transparent 58%,
      color-mix(in srgb, var(--color-bg) 92%, transparent) 100%
    ),
    linear-gradient(
      to right,
      color-mix(in srgb, var(--color-bg) 76%, transparent) 0%,
      transparent 18%,
      transparent 82%,
      color-mix(in srgb, var(--color-bg) 76%, transparent) 100%
    );
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.movies-home__hero-mobile {
  display: none;
}

.movies-home__rows {
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
  display: grid;
  gap: clamp(var(--space-xl), 5vw, 64px);
  padding: var(--space-lg) clamp(var(--space-xl), 5vw, 64px) var(--space-xl);
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
  .movies-home__hero {
    block-size: auto;
    min-block-size: 0;
    padding-block-end: var(--space-lg);
    padding-block-start: calc(
      var(--movies-toolbar-content-offset, var(--control-height-md)) + var(--space-md)
    );
  }

  .movies-home__hero-backdrop {
    filter: blur(18px) saturate(1.18) contrast(1.04) brightness(0.7);
    transform: scale(1.08);
  }

  .movies-home__hero-edge {
    display: none;
  }

  .movies-home__hero-mobile {
    --movies-home-hero-card-width: clamp(220px, 64vw, 292px);
    --movies-home-hero-side-padding: max(
      var(--space-xl),
      calc((100% - var(--movies-home-hero-card-width)) / 2)
    );

    display: grid;
    gap: var(--space-md);
    min-inline-size: 0;
    position: relative;
    z-index: 2;
  }

  .movies-home__hero-slider {
    display: grid;
    gap: var(--space-lg);
    grid-auto-columns: var(--movies-home-hero-card-width);
    grid-auto-flow: column;
    list-style: none;
    margin: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding: var(--space-xs) var(--movies-home-hero-side-padding) var(--space-md);
    scroll-padding-inline: var(--movies-home-hero-side-padding);
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .movies-home__hero-slider::-webkit-scrollbar {
    display: none;
  }

  .movies-home__hero-slide {
    min-inline-size: 0;
    scroll-snap-align: center;
  }

  .movies-home__hero-card {
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    display: block;
    inline-size: 100%;
    padding: 0;
    text-align: start;
  }

  .movies-home__hero-card:focus-visible {
    border-radius: var(--radius-md);
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
  }

  .movies-home__hero-poster-wrap {
    aspect-ratio: 2 / 3;
    background: color-mix(in srgb, var(--color-fg) 10%, transparent);
    border: 2px solid color-mix(in srgb, var(--color-fg) 38%, transparent);
    border-radius: var(--radius-md);
    box-shadow: none;
    display: block;
    overflow: hidden;
    position: relative;
    transform: scale(0.9);
    transition:
      filter var(--duration-base) var(--ease),
      opacity var(--duration-base) var(--ease),
      transform var(--duration-base) var(--ease);
  }

  .movies-home__hero-slide:not(.movies-home__hero-slide--active) .movies-home__hero-poster-wrap {
    filter: saturate(0.8) brightness(0.76);
    opacity: 0.74;
  }

  .movies-home__hero-slide--active .movies-home__hero-poster-wrap {
    filter: none;
    opacity: 1;
    transform: scale(1);
  }

  .movies-home__hero-poster {
    block-size: 100%;
    display: block;
    inline-size: 100%;
    object-fit: cover;
  }

  .movies-home__hero-poster--empty {
    background: color-mix(in srgb, var(--color-fg) 14%, transparent);
  }

  .movies-home__hero-chip,
  .movies-home__hero-rating {
    background: color-mix(in srgb, var(--color-bg) 76%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
    border-radius: var(--radius-sm);
    color: var(--color-fg);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    line-height: var(--leading-tight);
    max-inline-size: calc(100% - var(--space-lg));
    overflow: hidden;
    padding: var(--space-2xs) var(--space-xs);
    position: absolute;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .movies-home__hero-chip {
    inset-block-start: var(--space-xs);
    inset-inline-start: var(--space-xs);
  }

  .movies-home__hero-chip--kind {
    inset-inline-end: var(--space-xs);
    inset-inline-start: auto;
  }

  .movies-home__hero-rating {
    background: color-mix(in srgb, var(--color-accent) 72%, var(--color-bg));
    inset-block-end: var(--space-xs);
    inset-inline-end: var(--space-xs);
  }

  .movies-home__hero-copy {
    display: grid;
    gap: var(--space-sm);
    justify-items: center;
    margin-inline: auto;
    max-inline-size: min(560px, 100%);
    padding-inline: var(--space-lg);
    text-align: center;
  }

  .movies-home__hero-copy h1,
  .movies-home__hero-meta {
    margin: 0;
  }

  .movies-home__hero-copy h1 {
    font-size: var(--font-size-2xl);
    line-height: var(--leading-tight);
  }

  .movies-home__hero-meta {
    color: color-mix(in srgb, var(--color-fg) 78%, transparent);
    line-height: var(--leading-snug);
  }

  .movies-home__rows {
    gap: var(--space-xl);
    padding: var(--space-lg) var(--space-md) var(--space-xl);
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
  .movies-home__hero-poster-wrap {
    transition: none;
  }

  .movies-home__continue-image {
    transition: none;
  }

  .movies-home__hero-slider {
    scroll-behavior: auto;
  }
}
</style>
