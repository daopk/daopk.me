<script setup vapor lang="ts">
import { computed, toRef } from "vue";

import ChevronRight from "~icons/lucide/chevron-right";
import { AspectRatio, Button } from "@daopk/ui";

import { useMoviesI18n } from "../i18n/useMoviesI18n";
import type { MovieSummary } from "../moviesApi";
import { useHomeHeroCarousel } from "../composables/useHomeHeroCarousel";

interface HomeHeroProps {
  readonly featured: readonly MovieSummary[];
}

const props = defineProps<HomeHeroProps>();

const emit = defineEmits<{
  "open-detail": [movie: MovieSummary];
}>();

const { t } = useMoviesI18n();
const { activeIndex, isDesktopDragging, setActiveIndex, setDesktopHeroRef, setMobileHeroRef } =
  useHomeHeroCarousel(toRef(props, "featured"));

const activeHero = computed(() => props.featured[activeIndex.value] ?? props.featured[0] ?? null);

function heroBackdropUrl(movie: MovieSummary): string {
  return movie.backdropUrl || movie.thumbUrl || movie.posterUrl;
}

function heroPosterUrl(movie: MovieSummary): string {
  return movie.posterUrl || movie.thumbUrl;
}

function heroMetaLabel(movie: MovieSummary): string {
  return [movie.originName, movie.genres[0]?.name, movie.year]
    .filter((item): item is string | number => item !== "" && item !== null && item !== undefined)
    .join(" · ");
}

function heroCardAriaLabel(movie: MovieSummary, index: number): string {
  return index === activeIndex.value
    ? t("movies.home.hero.openTitle", { title: movie.name })
    : t("movies.home.hero.activateTitle", { title: movie.name });
}

function openHero(movie: MovieSummary): void {
  emit("open-detail", movie);
}

function activateHeroItem(movie: MovieSummary, index: number, event: MouseEvent): void {
  if (event.defaultPrevented) {
    event.preventDefault();
    return;
  }

  if (index === activeIndex.value) {
    openHero(movie);
    return;
  }

  setActiveIndex(index);
}

function changeHeroByKeydown(event: KeyboardEvent): void {
  if (props.featured.length === 0) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setActiveIndex(activeIndex.value - 1);
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    setActiveIndex(activeIndex.value + 1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    setActiveIndex(0);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    setActiveIndex(props.featured.length - 1);
  }
}
</script>

<template>
  <section
    v-if="activeHero"
    class="movies-home__hero"
    :aria-label="t('movies.home.hero.ariaLabel')"
  >
    <img
      v-if="heroBackdropUrl(activeHero)"
      class="movies-home__hero-backdrop"
      :src="heroBackdropUrl(activeHero)"
      alt=""
      aria-hidden="true"
    />
    <div class="movies-home__hero-edge" aria-hidden="true" />

    <div class="movies-home__hero-desktop">
      <div class="movies-home__hero-copy">
        <p class="movies-home__hero-eyebrow">{{ t("movies.home.hero.eyebrow") }}</p>
        <h1>
          <button
            type="button"
            class="movies-home__hero-title-button"
            :aria-label="t('movies.home.hero.openTitle', { title: activeHero.name })"
            @click="openHero(activeHero)"
          >
            {{ activeHero.name }}
          </button>
        </h1>
        <p v-if="heroMetaLabel(activeHero)" class="movies-home__hero-meta">
          {{ heroMetaLabel(activeHero) }}
        </p>
        <p v-if="activeHero.overview" class="movies-home__hero-overview">
          {{ activeHero.overview }}
        </p>
        <div class="movies-home__hero-actions">
          <Button
            class="movies-home__hero-details"
            :class-names="{ right: 'movies-home__hero-details-icon' }"
            variant="surface"
            size="sm"
            :aria-label="t('movies.home.hero.openTitle', { title: activeHero.name })"
            @click="openHero(activeHero)"
          >
            {{ t("movies.action.details") }}
            <template #right><ChevronRight aria-hidden="true" /></template>
          </Button>
        </div>
      </div>

      <div class="movies-home__hero-list">
        <div
          :ref="setDesktopHeroRef"
          class="movies-home__hero-loop"
          :class="{ 'movies-home__hero-loop--dragging': isDesktopDragging }"
          :aria-label="t('movies.home.hero.loopAriaLabel')"
          aria-roledescription="carousel"
          tabindex="0"
          @keydown="changeHeroByKeydown"
        >
          <ul class="movies-home__hero-track">
            <li
              v-for="(movie, index) in featured"
              :key="movie.id"
              class="movies-home__hero-slide"
              :class="{ 'movies-home__hero-slide--active': index === activeIndex }"
              :data-hero-index="index"
              data-hero-slide
            >
              <button
                type="button"
                class="movies-home__hero-card"
                :aria-label="heroCardAriaLabel(movie, index)"
                @click="activateHeroItem(movie, index, $event)"
              >
                <AspectRatio class="movies-home__hero-poster-wrap" :ratio="2 / 3">
                  <img
                    v-if="heroPosterUrl(movie)"
                    class="movies-home__hero-poster"
                    :src="heroPosterUrl(movie)"
                    alt=""
                    aria-hidden="true"
                    :loading="index === activeIndex ? 'eager' : 'lazy'"
                    decoding="async"
                  />
                  <span
                    v-else
                    class="movies-home__hero-poster movies-home__hero-poster--empty"
                    aria-hidden="true"
                  />
                </AspectRatio>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="movies-home__hero-mobile">
      <div
        :ref="setMobileHeroRef"
        class="movies-home__hero-slider"
        :aria-label="t('movies.home.hero.sliderAriaLabel')"
        aria-roledescription="carousel"
        tabindex="0"
        @keydown="changeHeroByKeydown"
      >
        <ul class="movies-home__hero-track">
          <li
            v-for="(movie, index) in featured"
            :key="movie.id"
            class="movies-home__hero-slide"
            :class="{ 'movies-home__hero-slide--active': index === activeIndex }"
            :data-hero-index="index"
            data-hero-slide
          >
            <button
              type="button"
              class="movies-home__hero-card"
              :aria-label="t('movies.home.hero.openTitle', { title: movie.name })"
              @click="openHero(movie)"
            >
              <AspectRatio class="movies-home__hero-poster-wrap" :ratio="2 / 3">
                <img
                  v-if="heroPosterUrl(movie)"
                  class="movies-home__hero-poster"
                  :src="heroPosterUrl(movie)"
                  alt=""
                  aria-hidden="true"
                  :loading="index === activeIndex ? 'eager' : 'lazy'"
                  decoding="async"
                />
                <span
                  v-else
                  class="movies-home__hero-poster movies-home__hero-poster--empty"
                  aria-hidden="true"
                />
              </AspectRatio>
            </button>
          </li>
        </ul>
      </div>

      <div class="movies-home__hero-copy">
        <p class="movies-home__hero-eyebrow">{{ t("movies.home.hero.eyebrow") }}</p>
        <h1>
          <span class="movies-home__hero-title-text">{{ activeHero.name }}</span>
        </h1>
        <p v-if="heroMetaLabel(activeHero)" class="movies-home__hero-meta">
          {{ heroMetaLabel(activeHero) }}
        </p>
        <div class="movies-home__hero-actions">
          <Button
            class="movies-home__hero-details"
            :class-names="{ right: 'movies-home__hero-details-icon' }"
            variant="surface"
            size="sm"
            :aria-label="t('movies.home.hero.openTitle', { title: activeHero.name })"
            @click="openHero(activeHero)"
          >
            {{ t("movies.action.details") }}
            <template #right><ChevronRight aria-hidden="true" /></template>
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss" src="../styles/home-hero.scss"></style>
