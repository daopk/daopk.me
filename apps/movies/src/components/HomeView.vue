<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { ScrollArea, SegmentedControl, StatusBanner } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ChevronRight } from "@daopk/icons";

import MovieCard from "./MovieCard.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import {
  fetchMoviesList,
  HOME_DISCOVERY_GROUPS,
  type MovieSummary,
  type MoviesListPeriod,
  type MoviesListQuery,
  type MoviesRowConfig,
  type MoviesRowGroupConfig,
} from "../moviesApi";

type LoadState = "loading" | "ready" | "error";
type PeriodGroupId = Extract<MoviesRowGroupConfig["id"], "popular" | "trending">;

const emit = defineEmits<{
  "toolbar-solid": [solid: boolean];
  "open-detail": [movie: MovieSummary];
  "open-list": [query: MoviesListQuery];
}>();

const featured = ref<readonly MovieSummary[]>([]);
const rows = ref<Record<string, readonly MovieSummary[]>>({});
const state = ref<LoadState>("loading");
const selectedPeriods = ref<Record<PeriodGroupId, MoviesListPeriod>>({
  popular: "week",
  trending: "week",
});

let abortController: AbortController | null = null;

const activeHero = computed(() => featured.value[0] ?? null);

onMounted(() => {
  void loadHome();
});

onUnmounted(() => {
  abortController?.abort();
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

function onScroll(event: Event): void {
  const target = event.currentTarget as HTMLElement | null;
  emit("toolbar-solid", (target?.scrollTop ?? 0) > 32);
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
  <ScrollArea class="movies-home" safe-area @scroll="onScroll">
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <StatusBanner
      v-else-if="state === 'error'"
      class="movies-home__status"
      tone="error"
      role="alert"
    >
      Could not load Movies data. Try again later.
    </StatusBanner>

    <template v-else-if="activeHero">
      <section class="movies-home__hero" aria-label="Featured titles">
        <img
          v-if="activeHero.thumbUrl"
          class="movies-home__hero-backdrop"
          :src="activeHero.thumbUrl"
          alt=""
          aria-hidden="true"
        />
        <div class="movies-home__hero-edge" aria-hidden="true" />
      </section>

      <section class="movies-home__rows" aria-label="Discover titles">
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
      </section>
    </template>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-home {
  block-size: 100%;
  background: var(--color-bg);
  position: relative;
}

.movies-home__status {
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--space-md) 0;
}

.movies-home__hero {
  background: var(--color-bg);
  block-size: min(560px, 76vh);
  min-block-size: 320px;
  overflow: hidden;
  position: relative;
}

.movies-home__hero-backdrop {
  block-size: 100%;
  filter: saturate(1.04) contrast(1.02);
  inline-size: 100%;
  inset: 0;
  object-fit: cover;
  position: absolute;
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
}

.movies-home__rows {
  display: grid;
  gap: clamp(var(--space-xl), 5vw, 64px);
  padding: var(--space-lg) clamp(var(--space-xl), 5vw, 64px) var(--space-xl);
}

.movies-home__group {
  display: grid;
  gap: var(--space-md);
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
  scrollbar-width: thin;
}

.movies-home__rail-item {
  min-inline-size: 0;
}

@media (max-width: 640px) {
  .movies-home__group-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
