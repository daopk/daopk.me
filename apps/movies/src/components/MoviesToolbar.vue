<script setup vapor lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { Button, IconButton, Input, Modal } from "@daopk/ui";
import { ChevronLeft, ChevronRight, Film, Home, Search, Tv, X } from "@daopk/icons";

import { mediaLabel } from "../i18n/labels";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import { type MovieMediaType, type MoviesListQuery } from "../moviesApi";

interface InputHandle {
  focus: () => void;
  nativeElement: HTMLInputElement | null;
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
const searchInput = ref<InputHandle | null>(null);
const { t } = useMoviesI18n();

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
  searchInput.value?.focus();
  searchInput.value?.nativeElement?.select();
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
    <nav class="movies-toolbar__history" :aria-label="t('movies.nav.ariaLabel')">
      <IconButton
        class="movies-toolbar__history-button"
        :ariaLabel="t('movies.action.back')"
        size="sm"
        :disabled="!canGoBack"
        :title="t('movies.action.back')"
        @click="$emit('back')"
      >
        <ChevronLeft aria-hidden="true" />
      </IconButton>
      <IconButton
        class="movies-toolbar__history-button"
        :ariaLabel="t('movies.action.forward')"
        size="sm"
        :disabled="!canGoForward"
        :title="t('movies.action.forward')"
        @click="$emit('forward')"
      >
        <ChevronRight aria-hidden="true" />
      </IconButton>
      <IconButton
        class="movies-toolbar__history-button"
        :ariaLabel="t('movies.action.home')"
        size="sm"
        :disabled="!canGoHome"
        :title="t('movies.action.home')"
        @click="$emit('home')"
      >
        <Home aria-hidden="true" />
      </IconButton>
      <button
        type="button"
        class="movies-toolbar__history-menu-button"
        :aria-label="mediaLabel('movie', t)"
        :title="mediaLabel('movie', t)"
        @click="selectMedia('movie')"
      >
        <Film class="movies-toolbar__history-menu-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="movies-toolbar__history-menu-button"
        :aria-label="mediaLabel('tv', t)"
        :title="mediaLabel('tv', t)"
        @click="selectMedia('tv')"
      >
        <Tv class="movies-toolbar__history-menu-icon" aria-hidden="true" />
      </button>
    </nav>

    <nav class="movies-toolbar__catalog" :aria-label="t('movies.catalog.ariaLabel')">
      <button
        type="button"
        class="movies-toolbar__menu-button"
        :aria-label="mediaLabel('movie', t)"
        :title="mediaLabel('movie', t)"
        @click="selectMedia('movie')"
      >
        <Film class="movies-toolbar__menu-icon" aria-hidden="true" />
        <span>{{ mediaLabel("movie", t) }}</span>
      </button>

      <button
        type="button"
        class="movies-toolbar__menu-button"
        :aria-label="mediaLabel('tv', t)"
        :title="mediaLabel('tv', t)"
        @click="selectMedia('tv')"
      >
        <Tv class="movies-toolbar__menu-icon" aria-hidden="true" />
        <span>{{ mediaLabel("tv", t) }}</span>
      </button>
    </nav>

    <div class="movies-toolbar__actions">
      <IconButton
        class="movies-toolbar__search-button"
        :ariaLabel="t('movies.action.searchMovies')"
        size="sm"
        :variant="activeSearch.length > 0 || isSearchDialogOpen ? 'surface' : 'ghost'"
        :aria-pressed="isSearchDialogOpen || undefined"
        :title="t('movies.action.searchMovies')"
        @click="openSearchDialog"
      >
        <Search aria-hidden="true" />
      </IconButton>

      <IconButton
        v-if="showClose"
        class="movies-toolbar__close"
        :ariaLabel="t('movies.action.closeMovies')"
        size="sm"
        :title="t('movies.action.closeMovies')"
        @click="$emit('close')"
      >
        <X aria-hidden="true" />
      </IconButton>
    </div>

    <Modal
      :open="isSearchDialogOpen"
      :title="t('movies.search.dialog.title')"
      :teleport-to="searchDialogPortalTarget"
      :show-close-button="false"
      :initial-focus="'#movies-toolbar-search-input'"
      :class-names="{
        root: 'movies-toolbar__search-modal',
        overlay: 'movies-toolbar__search-modal-overlay',
        panel: 'movies-toolbar__search-modal-panel',
      }"
      :styles="{ root: { position: 'absolute' } }"
      :modal="false"
      @update:open="setSearchDialogOpen"
    >
      <form
        id="movies-toolbar-search-form"
        class="movies-toolbar__search-form"
        role="search"
        @submit.prevent="submitSearch"
      >
        <Input
          id="movies-toolbar-search-input"
          ref="searchInput"
          v-model="searchDraft"
          type="text"
          :ariaLabel="t('movies.search.input.ariaLabel')"
          :placeholder="t('movies.search.placeholder')"
          :input-attrs="{ autocomplete: 'off', role: 'searchbox' }"
        />
      </form>
      <template #footer>
        <Button type="button" variant="surface" @click="setSearchDialogOpen(false)">
          {{ t("movies.action.cancel") }}
        </Button>
        <Button
          form="movies-toolbar-search-form"
          type="submit"
          variant="solid"
          color="blue"
          :disabled="searchDraft.trim().length === 0"
        >
          <template #left><Search aria-hidden="true" /></template>
          {{ t("movies.action.submitSearch") }}
        </Button>
      </template>
    </Modal>
  </header>
</template>

<style scoped lang="scss" src="../styles/movies-toolbar.scss"></style>
