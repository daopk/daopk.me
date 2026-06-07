<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea, StatusBanner } from "@daopk/kit";
import { Button } from "@daopk/ui";

import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import MovieCard from "./MovieCard.vue";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
  fetchMoviesList,
  listTitleForQuery,
  SEARCH_MEDIA_LABELS,
  type MovieSummary,
  type MoviesListQuery,
  type MoviesPagination,
  type MoviesSearchMedia,
} from "../moviesApi";

type LoadState = "idle" | "loading" | "ready" | "error";

interface ListViewProps {
  query: MoviesListQuery;
}

const props = defineProps<ListViewProps>();

defineEmits<{
  "open-detail": [movie: MovieSummary];
  "open-list": [query: MoviesListQuery];
}>();

const items = ref<readonly MovieSummary[]>([]);
const pagination = ref<MoviesPagination | null>(null);
const state = ref<LoadState>("idle");
let abortController: AbortController | null = null;

const title = computed(() => listTitleForQuery(props.query));
const activeSearchMedia = computed(() => props.query.media ?? "all");
const searchMediaTabs = Object.entries(SEARCH_MEDIA_LABELS) as Array<[MoviesSearchMedia, string]>;
const loadingInitial = computed(() => state.value === "loading" && items.value.length === 0);
const canLoadMore = computed(
  () =>
    state.value !== "loading" &&
    pagination.value !== null &&
    pagination.value.currentPage < pagination.value.totalPages,
);

watch(
  () => props.query,
  () => {
    void loadFirstPage();
  },
  { immediate: true, deep: true },
);

onUnmounted(() => {
  abortController?.abort();
});

async function loadFirstPage(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";
  items.value = [];

  try {
    const result = await fetchMoviesList(
      { ...props.query, page: 1, limit: props.query.limit ?? DEFAULT_MOVIES_LIST_LIMIT },
      { signal: abortController.signal },
    );
    items.value = result.items;
    pagination.value = result.pagination;
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

async function loadMore(): Promise<void> {
  if (!canLoadMore.value || pagination.value === null) {
    return;
  }
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";

  try {
    const result = await fetchMoviesList(
      {
        ...props.query,
        page: pagination.value.currentPage + 1,
        limit: props.query.limit ?? DEFAULT_MOVIES_LIST_LIMIT,
      },
      { signal: abortController.signal },
    );
    items.value = [...items.value, ...result.items];
    pagination.value = result.pagination;
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}

function mediaQuery(media: MoviesSearchMedia): MoviesListQuery {
  return { ...props.query, media, page: 1 };
}
</script>

<template>
  <ScrollArea class="movies-list" safe-area>
    <header class="movies-list__header">
      <h1>{{ title }}</h1>
      <div v-if="query.keyword" class="movies-list__tabs" aria-label="Search media type">
        <Button
          v-for="[media, label] in searchMediaTabs"
          :key="media"
          size="sm"
          :variant="activeSearchMedia === media ? 'primary' : 'secondary'"
          @click="$emit('open-list', mediaQuery(media))"
        >
          {{ label }}
        </Button>
      </div>
    </header>

    <MoviesLoadingOverlay v-if="loadingInitial" />
    <StatusBanner v-else-if="state === 'error'" tone="error" role="alert">
      Could not load titles. Try again.
    </StatusBanner>

    <EmptyState
      v-else-if="state === 'ready' && items.length === 0"
      title="No titles found"
      description="Try another keyword or filter."
    />

    <template v-else>
      <ul class="movies-list__grid">
        <li v-for="movie in items" :key="movie.id" class="movies-list__item">
          <MovieCard :movie="movie" @open="$emit('open-detail', $event)" />
        </li>
      </ul>

      <div class="movies-list__footer">
        <Button
          v-if="canLoadMore"
          class="movies-list__load-more"
          size="sm"
          :loading="state === 'loading'"
          @click="loadMore"
        >
          Load more
        </Button>
      </div>
    </template>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-list {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  display: grid;
  gap: var(--space-lg);
  padding: calc(
      var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl))) +
        var(--space-xl)
    )
    clamp(var(--space-xl), 5vw, 64px) clamp(var(--space-xl), 10vh, 96px);
  position: relative;
}

.movies-list__header {
  display: grid;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.movies-list__header h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-list__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-list__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.movies-list__item {
  min-inline-size: 0;
}

.movies-list__footer {
  display: flex;
  justify-content: center;
  min-block-size: var(--control-height-lg);
  padding-block-start: var(--space-sm);
}

.movies-list__footer :deep(.movies-list__load-more.ds-button) {
  background: color-mix(in srgb, var(--color-bg-elevated) 42%, transparent);
  border-color: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-full);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 4px 10px -10px color-mix(in srgb, black 34%, transparent);
  color: color-mix(in srgb, var(--color-fg) 76%, transparent);
  font-weight: var(--font-weight-semibold);
  min-inline-size: 132px;
  padding-inline: var(--space-lg);
}

.movies-list__footer :deep(.movies-list__load-more.ds-button:hover),
.movies-list__footer :deep(.movies-list__load-more.ds-button:focus-visible) {
  background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 36%, var(--color-border));
  color: var(--color-fg);
}

.movies-list__footer :deep(.movies-list__load-more.ds-button--loading) {
  opacity: 0.68;
}
</style>
