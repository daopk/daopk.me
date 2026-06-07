<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import { IconButton, TextInput } from "@daopk/kit";
import { Button, Dialog, DialogActions, DropdownMenu, DropdownMenuItem } from "@daopk/ui";
import { ChevronLeft, ChevronRight, Film, Home, Menu, Search, Tv, X } from "@daopk/icons";

import type { MoviesListQuery } from "../moviesApi";

interface TextInputHandle {
  focus: (options?: FocusOptions) => void;
  select: () => void;
}

interface MoviesToolbarProps {
  solid: boolean;
  activeSearch?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  canGoHome?: boolean;
  showClose?: boolean;
}

const props = withDefaults(defineProps<MoviesToolbarProps>(), {
  activeSearch: "",
  canGoBack: false,
  canGoForward: false,
  canGoHome: false,
  showClose: false,
});

const emit = defineEmits<{
  back: [];
  close: [];
  forward: [];
  home: [];
  search: [keyword: string];
  "open-list": [query: MoviesListQuery];
}>();

const searchDraft = ref(props.activeSearch);
const isSearchDialogOpen = ref(false);
const searchInput = ref<TextInputHandle | null>(null);

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

function openPopularMovies(): void {
  emit("open-list", { kind: "popular-movie" });
}

function openPopularTv(): void {
  emit("open-list", { kind: "popular-tv" });
}
</script>

<template>
  <header
    class="movies-toolbar"
    :class="{ 'movies-toolbar--solid': solid, 'movies-toolbar--has-close': showClose }"
  >
    <DropdownMenu align="start">
      <template #trigger>
        <IconButton
          class="movies-toolbar__section-menu"
          label="Movies menu"
          size="sm"
          :icon="Menu"
          title="Movies menu"
        />
      </template>

      <template #items>
        <DropdownMenuItem
          class="movies-toolbar__section-menu-item"
          text-value="Movies"
          @select="openPopularMovies"
        >
          <Film class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>Movies</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          class="movies-toolbar__section-menu-item"
          text-value="TV"
          @select="openPopularTv"
        >
          <Tv class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>TV</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenu>

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

    <nav class="movies-toolbar__nav" aria-label="Movies sections">
      <Button class="movies-toolbar__menu-button" size="sm" @click="openPopularMovies">
        Movies
      </Button>
      <Button class="movies-toolbar__menu-button" size="sm" @click="openPopularTv"> TV </Button>
    </nav>

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

    <Dialog :open="isSearchDialogOpen" title="Search" @update:open="setSearchDialogOpen">
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

    <IconButton
      v-if="showClose"
      class="movies-toolbar__close"
      label="Close Movies"
      size="sm"
      :icon="X"
      title="Close Movies"
      @click="$emit('close')"
    />
  </header>
</template>

<style scoped lang="scss">
.movies-toolbar {
  align-items: center;
  backdrop-filter: blur(18px) saturate(120%);
  background: color-mix(in srgb, var(--color-bg) 24%, transparent);
  color: var(--color-fg);
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: auto minmax(0, 1fr) auto;
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
    box-shadow var(--duration-base) var(--ease);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  z-index: 2;
}

.movies-toolbar--has-close {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
}

.movies-toolbar--solid {
  background: color-mix(in srgb, var(--color-bg) 76%, transparent);
  border-block-end: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  box-shadow: var(--shadow-sm);
}

.movies-toolbar__section-menu {
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
  display: none;
}

.movies-toolbar__section-menu:hover,
.movies-toolbar__section-menu:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  color: var(--color-fg);
}

.movies-toolbar__history {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  border-radius: var(--radius-full);
  display: inline-flex;
  gap: var(--space-2xs);
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

.movies-toolbar__nav {
  align-items: center;
  display: flex;
  gap: var(--space-xs);
  min-inline-size: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.movies-toolbar__nav::-webkit-scrollbar {
  display: none;
}

.movies-toolbar__nav :deep(.movies-toolbar__menu-button.ds-button) {
  background: transparent;
  border: 0;
  box-shadow: none;
  color: color-mix(in srgb, var(--color-fg) 86%, transparent);
  padding-inline: var(--space-xs);
  white-space: nowrap;
}

.movies-toolbar__nav :deep(.movies-toolbar__menu-button.ds-button:hover),
.movies-toolbar__nav :deep(.movies-toolbar__menu-button.ds-button:focus-visible) {
  color: var(--color-fg);
}

.movies-toolbar__nav :deep(.movies-toolbar__menu-button.ds-button:focus-visible) {
  background: color-mix(in srgb, var(--color-fg) 8%, transparent);
  border-radius: var(--radius-full);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-fg) 18%, transparent);
  outline: 0;
}

.movies-toolbar__search-button {
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  color: color-mix(in srgb, var(--color-fg) 74%, transparent);
  justify-self: end;
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
  justify-self: end;
}

.movies-toolbar__close:hover,
.movies-toolbar__close:focus-visible {
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  color: var(--color-fg);
}

@media (max-width: 760px) {
  .movies-toolbar {
    align-items: center;
    background: color-mix(in srgb, var(--color-bg) 82%, transparent);
    border-block-end: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
    gap: var(--space-xs);
    grid-template-areas: "sections history search";
    grid-template-columns: auto auto minmax(0, 1fr);
    padding-block-end: var(--space-xs);
    padding-block-start: calc(var(--space-xs) + var(--mobile-shell-app-safe-area-top, 0px));
  }

  .movies-toolbar--has-close {
    grid-template-areas: "sections history search close";
    grid-template-columns: auto auto minmax(0, 1fr) auto;
  }

  .movies-toolbar__section-menu {
    display: inline-flex;
    grid-area: sections;
  }

  .movies-toolbar__section-menu-item {
    font-size: var(--font-size-base);
    min-block-size: 52px;
    padding-block: var(--space-md);
  }

  .movies-toolbar__section-menu-item :deep(.ds-dropdown-menu__item-icon) {
    block-size: 18px;
    inline-size: 18px;
  }

  .movies-toolbar__history {
    grid-area: history;
    min-inline-size: 0;
  }

  .movies-toolbar__nav {
    display: none;
    grid-area: nav;
    min-block-size: var(--control-height-sm);
    padding-inline-end: var(--space-xs);
  }

  .movies-toolbar__search-button {
    grid-area: search;
  }

  .movies-toolbar__close {
    grid-area: close;
  }
}

@media (max-width: 520px) {
  .movies-toolbar {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .movies-toolbar--has-close {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
  }

  .movies-toolbar__nav :deep(.movies-toolbar__menu-button.ds-button) {
    padding-inline: var(--space-2xs);
  }
}

@media (prefers-reduced-motion: reduce) {
  .movies-toolbar {
    transition: none;
  }
}
</style>
