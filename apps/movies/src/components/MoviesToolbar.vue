<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { IconButton, TextInput } from "@daopk/kit";
import { Button, Dialog, DialogActions } from "@daopk/ui";
import { ChevronLeft, ChevronRight, Film, Home, Search, Tv, X } from "@daopk/icons";

import { type MovieMediaType, type MoviesListQuery } from "../moviesApi";

interface TextInputHandle {
  focus: (options?: FocusOptions) => void;
  select: () => void;
}

interface MoviesToolbarProps {
  solid: boolean;
  activeListQuery?: MoviesListQuery | null;
  activeSearch?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  canGoHome?: boolean;
  searchDialogContainer?: HTMLElement | null;
  showClose?: boolean;
}

const props = withDefaults(defineProps<MoviesToolbarProps>(), {
  activeListQuery: null,
  activeSearch: "",
  canGoBack: false,
  canGoForward: false,
  canGoHome: false,
  searchDialogContainer: null,
  showClose: false,
});

const emit = defineEmits<{
  back: [];
  close: [];
  forward: [];
  home: [];
  "open-list": [query: MoviesListQuery];
  search: [keyword: string];
}>();

const searchDraft = ref(props.activeSearch);
const isSearchDialogOpen = ref(false);
const searchInput = ref<TextInputHandle | null>(null);

const activeCatalogQuery = computed(() =>
  props.activeListQuery?.keyword === undefined && props.activeListQuery?.kind === undefined
    ? props.activeListQuery
    : null,
);
const filterMedia = computed<MovieMediaType>(() =>
  activeCatalogQuery.value?.media === "tv" ? "tv" : "movie",
);
const searchDialogPortalTarget = computed(() => props.searchDialogContainer ?? "body");

watch(
  () => props.activeSearch,
  (next) => {
    searchDraft.value = next;
  },
);

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInput.value?.focus({ preventScroll: true });
  searchInput.value?.select();
}

function setSearchDialogOpen(next: boolean): void {
  isSearchDialogOpen.value = next;
  if (next) {
    searchDraft.value = props.activeSearch;
    void focusSearchInput();
  }
}

function openSearchDialog(): void {
  setSearchDialogOpen(true);
}

function submitSearch(): void {
  const keyword = searchDraft.value.trim();
  if (keyword.length === 0) {
    void focusSearchInput();
    return;
  }

  emit("search", keyword);
  setSearchDialogOpen(false);
}

function catalogBaseQuery(): MoviesListQuery {
  const current = activeCatalogQuery.value;
  return {
    ...(current?.country === undefined ? {} : { country: current.country }),
    ...(current?.countryName === undefined ? {} : { countryName: current.countryName }),
    ...(current?.genre === undefined ? {} : { genre: current.genre }),
    ...(current?.genreName === undefined ? {} : { genreName: current.genreName }),
    ...(current?.limit === undefined ? {} : { limit: current.limit }),
    media: filterMedia.value,
    ...(current?.sort === undefined ? {} : { sort: current.sort }),
  };
}

function openCatalogList(query: MoviesListQuery): void {
  emit("open-list", { ...query, page: 1 });
}

function selectMedia(media: MovieMediaType): void {
  const {
    genre: _genre,
    genreName: _genreName,
    filterFocus: _filterFocus,
    ...query
  } = catalogBaseQuery();
  openCatalogList({ ...query, media });
}
</script>

<template>
  <header
    class="movies-toolbar"
    :class="{ 'movies-toolbar--solid': solid, 'movies-toolbar--has-close': showClose }"
  >
    <nav class="movies-toolbar__history" aria-label="Movies navigation">
      <IconButton
        label="Back"
        size="sm"
        :icon="ChevronLeft"
        :disabled="!canGoBack"
        title="Back"
        @click="$emit('back')"
      />
      <IconButton
        label="Forward"
        size="sm"
        :icon="ChevronRight"
        :disabled="!canGoForward"
        title="Forward"
        @click="$emit('forward')"
      />
      <IconButton
        label="Home"
        size="sm"
        :icon="Home"
        :disabled="!canGoHome"
        title="Home"
        @click="$emit('home')"
      />
    </nav>

    <nav class="movies-toolbar__catalog" aria-label="Movies catalog">
      <button type="button" class="movies-toolbar__menu-button" @click="selectMedia('movie')">
        <Film class="movies-toolbar__menu-icon" aria-hidden="true" />
        <span>Movies</span>
      </button>

      <button type="button" class="movies-toolbar__menu-button" @click="selectMedia('tv')">
        <Tv class="movies-toolbar__menu-icon" aria-hidden="true" />
        <span>TV Shows</span>
      </button>
    </nav>

    <div class="movies-toolbar__actions">
      <IconButton
        class="movies-toolbar__search-button"
        label="Search Movies"
        size="sm"
        :active="activeSearch.length > 0 || isSearchDialogOpen"
        :icon="Search"
        :pressed="isSearchDialogOpen || undefined"
        title="Search Movies"
        @click="openSearchDialog"
      />

      <IconButton
        v-if="showClose"
        class="movies-toolbar__close"
        label="Close Movies"
        size="sm"
        :icon="X"
        title="Close Movies"
        @click="$emit('close')"
      />
    </div>

    <Dialog
      :open="isSearchDialogOpen"
      title="Search"
      :portal-to="searchDialogPortalTarget"
      scope="container"
      :modal="false"
      @update:open="setSearchDialogOpen"
    >
      <form class="movies-toolbar__search-form" role="search" @submit.prevent="submitSearch">
        <TextInput
          ref="searchInput"
          v-model="searchDraft"
          type="search"
          aria-label="Search movies"
          placeholder="Search..."
          autocomplete="off"
        />
        <DialogActions align="stretch">
          <Button type="button" variant="secondary" @click="setSearchDialogOpen(false)">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            :disabled="searchDraft.trim().length === 0"
            :icon-start="Search"
          >
            Search
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  </header>
</template>

<style scoped lang="scss">
.movies-toolbar {
  align-items: center;
  backdrop-filter: none;
  background: transparent;
  border-block-end: 1px solid transparent;
  color: var(--color-fg);
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  inline-size: 100%;
  inset-block-start: 0;
  padding-block-end: var(--space-sm);
  padding-block-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-top, 0px));
  padding-inline-end: calc(var(--space-md) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-md) + var(--mobile-shell-app-safe-area-left, 0px));
  position: absolute;
  transition:
    backdrop-filter var(--duration-base) var(--ease),
    background-color var(--duration-base) var(--ease),
    border-color var(--duration-base) var(--ease),
    box-shadow var(--duration-base) var(--ease);
  -webkit-backdrop-filter: none;
  z-index: 20;
}

.movies-toolbar--solid {
  backdrop-filter: blur(18px) saturate(120%);
  background: color-mix(in srgb, var(--color-bg) 76%, transparent);
  border-block-end: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  box-shadow: var(--shadow-sm);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
}

.movies-toolbar__history {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  border-radius: var(--radius-full);
  display: inline-flex;
  gap: var(--space-2xs);
  justify-self: start;
  min-block-size: var(--control-height-md);
  padding: 0 var(--space-2xs);
}

.movies-toolbar__history :deep(.ds-kit-icon-button) {
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
}

.movies-toolbar__history :deep(.ds-kit-icon-button:hover),
.movies-toolbar__history :deep(.ds-kit-icon-button:focus-visible) {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  color: var(--color-fg);
}

.movies-toolbar__catalog {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  justify-self: center;
  min-inline-size: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.movies-toolbar__catalog::-webkit-scrollbar {
  display: none;
}

.movies-toolbar__menu-button {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  border: 0;
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  font-size: var(--font-size-sm);
  gap: var(--space-xs);
  min-block-size: var(--control-height-md);
  max-inline-size: min(260px, 42vw);
  min-inline-size: 0;
  padding: 0 var(--space-md);
  white-space: nowrap;
}

.movies-toolbar__menu-button span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.movies-toolbar__menu-button:hover,
.movies-toolbar__menu-button:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  color: var(--color-fg);
}

.movies-toolbar__menu-icon {
  block-size: 14px;
  flex: 0 0 auto;
  inline-size: 14px;
}

.movies-toolbar__actions {
  align-items: center;
  display: inline-flex;
  gap: var(--space-sm);
  justify-self: end;
}

.movies-toolbar__search-button {
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
}

.movies-toolbar__search-button:hover,
.movies-toolbar__search-button:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  color: var(--color-fg);
}

.movies-toolbar__search-form {
  display: grid;
  gap: var(--space-md);
  padding-block-start: var(--space-sm);
}

.movies-toolbar__search-form :deep(.ds-kit-text-input) {
  inline-size: 100%;
}

.movies-toolbar__close {
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
}

.movies-toolbar__close:hover,
.movies-toolbar__close:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  color: var(--color-fg);
}

@media (max-width: 760px) {
  .movies-toolbar {
    align-items: center;
    gap: var(--space-xs);
    grid-template-areas: "history catalog actions";
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding-block-end: var(--space-xs);
    padding-block-start: calc(var(--space-xs) + var(--mobile-shell-app-safe-area-top, 0px));
  }

  .movies-toolbar--has-close {
    grid-template-areas: "history catalog actions";
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .movies-toolbar__history {
    grid-area: history;
    min-inline-size: 0;
  }

  .movies-toolbar__catalog {
    grid-area: catalog;
    justify-content: flex-start;
    justify-self: stretch;
  }

  .movies-toolbar__menu-button {
    max-inline-size: 220px;
  }

  .movies-toolbar__actions {
    gap: var(--space-xs);
    grid-area: actions;
  }
}

@media (max-width: 520px) {
  .movies-toolbar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .movies-toolbar--has-close {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .movies-toolbar__menu-button {
    max-inline-size: 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .movies-toolbar {
    transition: none;
  }
}
</style>
