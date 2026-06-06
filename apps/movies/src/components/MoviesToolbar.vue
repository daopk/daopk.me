<script setup lang="ts">
import { ref, watch } from "vue";

import { TextInput } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { Search } from "@daopk/icons";

import type { MoviesListQuery } from "../moviesApi";

interface MoviesToolbarProps {
  solid: boolean;
  activeSearch?: string;
}

const props = withDefaults(defineProps<MoviesToolbarProps>(), {
  activeSearch: "",
});

const emit = defineEmits<{
  home: [];
  search: [keyword: string];
  "open-list": [query: MoviesListQuery];
}>();

const searchDraft = ref(props.activeSearch);

watch(
  () => props.activeSearch,
  (next) => {
    searchDraft.value = next;
  },
);

function submitSearch(): void {
  const keyword = searchDraft.value.trim();
  if (keyword.length > 0) {
    emit("search", keyword);
  }
}
</script>

<template>
  <header class="movies-toolbar" :class="{ 'movies-toolbar--solid': solid }">
    <button type="button" class="movies-toolbar__brand" @click="$emit('home')">
      <span>Movies</span>
    </button>

    <nav class="movies-toolbar__nav" aria-label="Movies sections">
      <Button
        class="movies-toolbar__menu-button"
        size="sm"
        @click="$emit('open-list', { kind: 'trending-movie' })"
      >
        Trending
      </Button>
      <Button
        class="movies-toolbar__menu-button"
        size="sm"
        @click="$emit('open-list', { kind: 'popular-movie' })"
      >
        Movies
      </Button>
      <Button
        class="movies-toolbar__menu-button"
        size="sm"
        @click="$emit('open-list', { kind: 'popular-tv' })"
      >
        TV
      </Button>
      <Button
        class="movies-toolbar__menu-button"
        size="sm"
        @click="$emit('open-list', { kind: 'now-playing' })"
      >
        Now Playing
      </Button>
    </nav>

    <form class="movies-toolbar__search" role="search" @submit.prevent="submitSearch">
      <button type="submit" class="movies-toolbar__search-button" aria-label="Search">
        <Search class="movies-toolbar__search-icon" aria-hidden="true" />
      </button>
      <TextInput
        v-model="searchDraft"
        type="search"
        variant="plain"
        aria-label="Search movies"
        placeholder="Search..."
      />
    </form>
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
  grid-template-columns: auto minmax(0, 1fr) minmax(180px, 320px);
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

.movies-toolbar--solid {
  background: color-mix(in srgb, var(--color-bg) 76%, transparent);
  border-block-end: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  box-shadow: var(--shadow-sm);
}

.movies-toolbar__brand {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 36%, transparent);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  font-weight: var(--font-weight-bold);
  gap: var(--space-xs);
  min-block-size: var(--control-height-md);
  padding: 0 var(--space-sm);
}

.movies-toolbar__brand:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
  background: transparent;
  color: var(--color-fg);
}

.movies-toolbar__search {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-full);
  display: grid;
  gap: var(--space-xs);
  grid-template-columns: auto minmax(0, 1fr);
  min-inline-size: 0;
  padding: 0 var(--space-sm);
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
}

.movies-toolbar__search:focus-within {
  border-color: color-mix(in srgb, var(--color-fg) 46%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-fg) 14%, transparent);
}

.movies-toolbar__search-button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--color-fg) 62%, transparent);
  cursor: pointer;
  display: inline-flex;
  justify-content: center;
  margin-inline-start: calc(var(--space-xs) * -1);
  min-block-size: 28px;
  min-inline-size: 28px;
  padding: 0;
}

.movies-toolbar__search-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.movies-toolbar__search-icon {
  block-size: 16px;
  inline-size: 16px;
  pointer-events: none;
}

.movies-toolbar__search:focus-within .movies-toolbar__search-button,
.movies-toolbar__search-button:hover {
  color: var(--color-fg);
}

.movies-toolbar__search :deep(.ds-kit-text-input:focus-visible) {
  outline: 0;
}

@media (max-width: 760px) {
  .movies-toolbar {
    align-items: center;
    background: color-mix(in srgb, var(--color-bg) 82%, transparent);
    border-block-end: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
    gap: var(--space-xs);
    grid-template-areas:
      "brand search"
      "nav nav";
    grid-template-columns: auto minmax(0, 1fr);
    padding-block-end: var(--space-xs);
    padding-block-start: calc(var(--space-xs) + var(--mobile-shell-app-safe-area-top, 0px));
  }

  .movies-toolbar__brand {
    grid-area: brand;
    min-inline-size: 0;
    padding-inline: var(--space-xs);
  }

  .movies-toolbar__brand span {
    max-inline-size: 8ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .movies-toolbar__nav {
    grid-area: nav;
    min-block-size: var(--control-height-sm);
    padding-inline-end: var(--space-xs);
  }

  .movies-toolbar__search {
    grid-area: search;
    min-inline-size: 0;
  }
}

@media (max-width: 520px) {
  .movies-toolbar {
    grid-template-columns: auto minmax(0, 1fr);
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
