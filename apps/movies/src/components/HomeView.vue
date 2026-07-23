<script setup vapor lang="ts">
import { nextTick } from "vue";

import { ScrollArea } from "@daopk/kit";
import {
  Alert,
  AspectRatio,
  Button,
  ContextMenu,
  ContextMenuItem,
  Radio,
  RadioGroup,
} from "@daopk/ui";
import ChevronRight from "~icons/lucide/chevron-right";
import Trash2 from "~icons/lucide/trash-2";

import HomeHero from "./HomeHero.vue";
import MovieCard from "./MovieCard.vue";
import MovieTrailerHoverPreview from "./MovieTrailerHoverPreview.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import { useMovieTrailerPreview } from "../composables/useMovieTrailerPreview";
import { useMoviesHomeView } from "../composables/useMoviesHomeView";
import { homeGroupTitle, homePeriodOptions, homeRowTitle, rowListLabel } from "../i18n/labels";
import {
  HOME_DISCOVERY_GROUPS,
  type MovieEpisodeTarget,
  type MoviesRowGroupConfig,
  type MovieSummary,
  type MoviesListQuery,
} from "../moviesApi";
import type { MoviesWatchContinuity } from "../moviesWatchContinuity";

interface HomeViewProps {
  watchContinuity: MoviesWatchContinuity;
}

const props = defineProps<HomeViewProps>();

const emit = defineEmits<{
  "open-continue-episode": [request: MovieEpisodeTarget];
  "open-continue-movie": [movie: MovieSummary];
  "open-detail": [movie: MovieSummary];
  "open-list": [query: MoviesListQuery];
}>();

const {
  anchorMode: trailerPreviewAnchorMode,
  close: closeTrailerPreview,
  closeNow: closeTrailerPreviewNow,
  enabled: trailerPreviewEnabled,
  keepOpen: keepTrailerPreviewOpen,
  movie: trailerPreviewMovie,
  move: moveTrailerPreview,
  reference: trailerPreviewReference,
  showFromFocus: showTrailerPreviewFromFocus,
  showFromPointer: showTrailerPreviewFromPointer,
  trailerCache: trailerPreviewCache,
} = useMovieTrailerPreview();

const {
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
} = useMoviesHomeView({
  closeTrailerPreviewNow,
  openContinueEpisode,
  openContinueMovie,
  watchContinuity: props.watchContinuity,
});

async function closeTrailerPreviewBeforeNavigation(): Promise<void> {
  closeTrailerPreviewNow();
  await nextTick();
}

async function openContinueEpisode(request: MovieEpisodeTarget): Promise<void> {
  await closeTrailerPreviewBeforeNavigation();
  emit("open-continue-episode", request);
}

async function openContinueMovie(movie: MovieSummary): Promise<void> {
  await closeTrailerPreviewBeforeNavigation();
  emit("open-continue-movie", movie);
}

async function openDetail(movie: MovieSummary): Promise<void> {
  await closeTrailerPreviewBeforeNavigation();
  emit("open-detail", movie);
}

async function openList(query: MoviesListQuery): Promise<void> {
  await closeTrailerPreviewBeforeNavigation();
  emit("open-list", query);
}

function updateGroupPeriod(group: MoviesRowGroupConfig, value: string | number | null): void {
  if (typeof value === "string") setGroupPeriod(group, value);
}
</script>

<template>
  <ScrollArea class="movies-home" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading' && !hasHomeContent" />

    <Alert
      v-else-if="state === 'error' && !hasHomeContent"
      class="movies-home__status"
      color="red"
      variant="surface"
      role="alert"
    >
      {{ t("movies.error.homeData") }}
    </Alert>

    <HomeHero v-if="hasFeatured" :featured="featured" @open-detail="openDetail" />

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
              <ContextMenu>
                <template #trigger>
                  <button
                    type="button"
                    class="movies-home__continue-card"
                    :aria-label="continueAriaLabel(item)"
                    @click="openContinueWatchingItem(item)"
                  >
                    <AspectRatio class="movies-home__continue-media" :ratio="16 / 9">
                      <span class="movies-home__continue-media-content">
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
                        <span class="movies-home__continue-badge">{{
                          continueKindLabel(item)
                        }}</span>
                        <span class="movies-home__continue-progress" aria-hidden="true">
                          <span
                            class="movies-home__continue-progress-value"
                            :style="{ inlineSize: continueProgressWidth(item) }"
                          />
                        </span>
                      </span>
                    </AspectRatio>

                    <span class="movies-home__continue-body">
                      <span class="movies-home__continue-title">{{ item.title }}</span>
                      <span v-if="item.subtitle" class="movies-home__continue-subtitle">
                        {{ item.subtitle }}
                      </span>
                    </span>
                  </button>
                </template>

                <template #items>
                  <ContextMenuItem @select="removeContinueWatchingItem(item)">
                    <Trash2 class="movies-home__continue-menu-icon" aria-hidden="true" />
                    <span>{{ t("movies.home.continue.remove") }}</span>
                  </ContextMenuItem>
                </template>
              </ContextMenu>
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
              <RadioGroup
                v-if="group.periodOptions"
                class="movies-home__period-control"
                orientation="horizontal"
                :ariaLabel="
                  t('movies.home.periodControlLabel', { group: homeGroupTitle(group, t) })
                "
                :model-value="groupPeriodValue(group)"
                size="sm"
                @update:model-value="updateGroupPeriod(group, $event)"
              >
                <Radio
                  v-for="option in homePeriodOptions(group, t)"
                  :key="option.value"
                  :value="option.value"
                  :class-names="{
                    root: 'movies-home__period-option',
                    indicator: 'movies-home__period-indicator',
                  }"
                >
                  {{ option.label }}
                </Radio>
              </RadioGroup>
            </div>

            <div class="movies-home__group-rows">
              <section v-for="row in group.rows" :key="row.id" class="movies-home__row">
                <div class="movies-home__row-header">
                  <h3>{{ homeRowTitle(row, t) }}</h3>
                  <Button
                    class="movies-home__row-action"
                    size="sm"
                    variant="ghost"
                    :aria-label="t('movies.home.viewAll', { label: rowListLabel(group, row, t) })"
                    @click="openList(queryForRow(group, row))"
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>

                <ul class="movies-home__rail">
                  <li
                    v-for="movie in rows[row.id] ?? []"
                    :key="movie.id"
                    class="movies-home__rail-item"
                  >
                    <MovieCard
                      :movie="movie"
                      @blur="closeTrailerPreview"
                      @focus="showTrailerPreviewFromFocus(movie, $event)"
                      @pointerenter="showTrailerPreviewFromPointer(movie, $event)"
                      @pointerleave="closeTrailerPreview"
                      @pointermove="moveTrailerPreview(movie, $event)"
                      @open="openDetail"
                    />
                  </li>
                </ul>
              </section>
            </div>
          </section>
        </template>
      </div>
    </section>

    <MovieTrailerHoverPreview
      :anchor-mode="trailerPreviewAnchorMode"
      :disabled="!trailerPreviewEnabled"
      :movie="trailerPreviewMovie"
      :reference="trailerPreviewReference"
      :trailer-cache="trailerPreviewCache"
      @preview-enter="keepTrailerPreviewOpen"
      @preview-leave="closeTrailerPreview"
    />
  </ScrollArea>
</template>

<style scoped lang="scss" src="../styles/home-view.scss"></style>
