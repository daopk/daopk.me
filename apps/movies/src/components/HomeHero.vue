<script setup lang="ts">
import { computed, toRef } from "vue";

import { ChevronRight } from "@daopk/icons";
import { Button } from "@daopk/ui";

import type { MovieSummary } from "../moviesApi";
import { useHomeHeroCarousel } from "../composables/useHomeHeroCarousel";

interface HomeHeroProps {
  readonly featured: readonly MovieSummary[];
}

const props = defineProps<HomeHeroProps>();

const emit = defineEmits<{
  "open-detail": [movie: MovieSummary];
}>();

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
  return `${index === activeIndex.value ? "Open" : "Activate"} ${movie.name}`;
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
  <section v-if="activeHero" class="movies-home__hero" aria-label="Featured titles">
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
        <p class="movies-home__hero-eyebrow">Trending this week</p>
        <h1>
          <button
            type="button"
            class="movies-home__hero-title-button"
            :aria-label="`Open ${activeHero.name}`"
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
            variant="secondary"
            size="sm"
            :icon-end="ChevronRight"
            :aria-label="`Open ${activeHero.name}`"
            @click="openHero(activeHero)"
          >
            Details
          </Button>
        </div>
      </div>

      <div class="movies-home__hero-list">
        <div
          :ref="setDesktopHeroRef"
          class="movies-home__hero-loop"
          :class="{ 'movies-home__hero-loop--dragging': isDesktopDragging }"
          aria-label="Featured title loop"
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
                <span class="movies-home__hero-poster-wrap">
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
                </span>
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
        aria-label="Featured title slider"
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
              :aria-label="`Open ${movie.name}`"
              @click="openHero(movie)"
            >
              <span class="movies-home__hero-poster-wrap">
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
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div class="movies-home__hero-copy">
        <p class="movies-home__hero-eyebrow">Trending this week</p>
        <h1>{{ activeHero.name }}</h1>
        <p v-if="heroMetaLabel(activeHero)" class="movies-home__hero-meta">
          {{ heroMetaLabel(activeHero) }}
        </p>
        <div class="movies-home__hero-actions">
          <Button
            class="movies-home__hero-details"
            variant="secondary"
            size="sm"
            :icon-end="ChevronRight"
            :aria-label="`Open ${activeHero.name}`"
            @click="openHero(activeHero)"
          >
            Details
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.movies-home__hero {
  --movies-home-hero-fade-size: clamp(128px, 20vh, 240px);
  --movies-home-hero-slider-fade: clamp(28px, 6vw, 72px);

  background: var(--movies-home-bg-top, var(--movies-surface-bg, var(--color-bg)));
  block-size: min(560px, 76vh);
  min-block-size: 360px;
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
      30%,
    color-mix(
        in srgb,
        var(--movies-home-bg-top, var(--movies-surface-bg, var(--color-bg))) 74%,
        transparent
      )
      72%,
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
  filter: saturate(1.08) contrast(1.08) brightness(0.84);
  inline-size: 100%;
  inset: 0;
  object-fit: cover;
  position: absolute;
  transform: scale(1.02);
  z-index: 0;
}

.movies-home__hero-edge {
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-bg) 78%, transparent) 0%,
      color-mix(in srgb, var(--color-bg) 24%, transparent) 20%,
      transparent 46%,
      color-mix(in srgb, var(--color-bg) 88%, transparent) 100%
    ),
    linear-gradient(
      to right,
      color-mix(in srgb, var(--color-bg) 86%, transparent) 0%,
      color-mix(in srgb, var(--color-bg) 54%, transparent) 28%,
      transparent 58%,
      color-mix(in srgb, var(--color-bg) 72%, transparent) 100%
    );
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.movies-home__hero-desktop {
  align-items: end;
  block-size: 100%;
  box-sizing: border-box;
  display: grid;
  gap: clamp(var(--space-xl), 5vw, 72px);
  grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.1fr);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: 1440px;
  padding: calc(var(--movies-toolbar-content-offset, var(--control-height-md)) + var(--space-xl))
    clamp(var(--space-xl), 5vw, 72px) clamp(56px, 8vh, 96px);
  position: relative;
  z-index: 2;
}

.movies-home__hero-copy {
  display: grid;
  gap: var(--space-md);
  min-inline-size: 0;
}

.movies-home__hero-copy h1,
.movies-home__hero-eyebrow,
.movies-home__hero-meta,
.movies-home__hero-overview {
  margin: 0;
}

.movies-home__hero-copy h1 {
  font-size: calc(var(--font-size-2xl) * 2.45);
  letter-spacing: 0;
  line-height: 1.04;
  max-inline-size: 12ch;
  text-wrap: balance;
}

.movies-home__hero-title-button {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: block;
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  padding: 0;
  text-align: inherit;
  text-wrap: inherit;
}

.movies-home__hero-title-button:focus {
  outline: 0;
}

.movies-home__hero-title-button:focus-visible {
  color: color-mix(in srgb, var(--color-fg) 82%, var(--color-accent) 18%);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--color-accent) 76%, transparent);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.12em;
}

.movies-home__hero-title-button:hover {
  color: color-mix(in srgb, var(--color-fg) 86%, var(--color-accent) 14%);
}

.movies-home__hero-eyebrow {
  color: color-mix(in srgb, var(--color-fg) 72%, transparent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0;
  line-height: var(--leading-tight);
  text-transform: uppercase;
}

.movies-home__hero-meta {
  color: color-mix(in srgb, var(--color-fg) 84%, transparent);
  font-size: var(--font-size-lg);
  line-height: var(--leading-snug);
}

.movies-home__hero-overview {
  color: color-mix(in srgb, var(--color-fg) 80%, transparent);
  display: -webkit-box;
  font-size: var(--font-size-sm);
  -webkit-line-clamp: 4;
  line-clamp: 4;
  line-height: var(--leading-relaxed);
  max-inline-size: 54ch;
  overflow: hidden;
  -webkit-box-orient: vertical;
}

.movies-home__hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding-block-start: var(--space-xs);
}

.movies-home__hero-details {
  backdrop-filter: blur(18px) saturate(1.18);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, white 14%, transparent),
      color-mix(in srgb, var(--color-accent) 12%, transparent)
    ),
    color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
  border-color: color-mix(in srgb, white 22%, var(--color-border));
  border-radius: 8px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 20%, transparent),
    0 14px 30px -24px color-mix(in srgb, black 82%, transparent);
  color: color-mix(in srgb, var(--color-fg) 92%, white 8%);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0;
  padding-inline: var(--space-md) var(--space-sm);
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.movies-home__hero-details:hover {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, white 18%, transparent),
      color-mix(in srgb, var(--color-accent) 18%, transparent)
    ),
    color-mix(in srgb, var(--color-bg-elevated) 62%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 42%, white 24%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent),
    0 18px 34px -24px color-mix(in srgb, var(--color-accent) 52%, black);
  color: var(--color-fg);
}

.movies-home__hero-details:focus {
  outline: 0;
}

.movies-home__hero-details:focus-visible {
  outline: 0;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 22%, transparent),
    0 0 0 3px color-mix(in srgb, var(--color-accent) 34%, transparent),
    0 18px 34px -24px color-mix(in srgb, var(--color-accent) 52%, black);
}

.movies-home__hero-details :deep(.ds-button__icon) {
  block-size: 13px;
  inline-size: 13px;
  transition: transform var(--duration-fast) var(--ease);
}

.movies-home__hero-details:hover :deep(.ds-button__icon) {
  transform: translateX(2px);
}

.movies-home__hero-list {
  align-self: end;
  display: grid;
  gap: var(--space-md);
  min-inline-size: 0;
}

.movies-home__hero-loop {
  cursor: grab;
  min-inline-size: 0;
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--movies-home-hero-slider-fade),
    black calc(100% - var(--movies-home-hero-slider-fade)),
    transparent 100%
  );
  overflow: hidden;
  user-select: none;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--movies-home-hero-slider-fade),
    black calc(100% - var(--movies-home-hero-slider-fade)),
    transparent 100%
  );
}

.movies-home__hero-loop:active {
  cursor: grabbing;
}

.movies-home__hero-loop:focus-visible,
.movies-home__hero-slider:focus-visible {
  border-radius: 8px;
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}

.movies-home__hero-track {
  align-items: start;
  display: flex;
  gap: clamp(var(--space-sm), 1.4vw, var(--space-md));
  list-style: none;
  margin: 0;
  min-inline-size: 0;
  padding: var(--space-md) var(--space-xs);
  touch-action: pan-y pinch-zoom;
}

.movies-home__hero-loop .movies-home__hero-slide {
  flex: 0 0 clamp(128px, 22%, 190px);
  transition: opacity var(--duration-base) var(--ease);
}

.movies-home__hero-slider {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--movies-home-hero-slider-fade),
    black calc(100% - var(--movies-home-hero-slider-fade)),
    transparent 100%
  );
  min-inline-size: 0;
  overflow: hidden;
  overscroll-behavior-x: contain;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--movies-home-hero-slider-fade),
    black calc(100% - var(--movies-home-hero-slider-fade)),
    transparent 100%
  );
}

.movies-home__hero-slide {
  min-inline-size: 0;
}

.movies-home__hero-card {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: inherit;
  display: grid;
  gap: var(--space-sm);
  inline-size: 100%;
  min-inline-size: 0;
  padding: 0;
  text-align: start;
}

.movies-home__hero-card:focus {
  outline: 0;
}

.movies-home__hero-card:focus-visible {
  outline: 0;
}

.movies-home__hero-poster-wrap {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 26%, transparent);
  border-radius: 8px;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 16%, transparent),
    0 18px 38px -28px color-mix(in srgb, black 74%, transparent);
  display: block;
  overflow: hidden;
  position: relative;
  transition:
    border-color var(--duration-base) var(--ease),
    box-shadow var(--duration-base) var(--ease),
    filter var(--duration-base) var(--ease),
    opacity var(--duration-base) var(--ease);
}

.movies-home__hero-slide:not(.movies-home__hero-slide--active) .movies-home__hero-poster-wrap {
  filter: saturate(0.88) brightness(0.82);
  opacity: 0.8;
}

.movies-home__hero-slide--active .movies-home__hero-poster-wrap {
  border-color: color-mix(in srgb, var(--color-accent) 72%, white 28%);
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 16%, transparent),
    0 22px 46px -24px color-mix(in srgb, var(--color-accent) 62%, black);
  filter: none;
  opacity: 1;
}

.movies-home__hero-card:focus-visible .movies-home__hero-poster-wrap {
  border-color: color-mix(in srgb, var(--color-accent) 82%, white 18%);
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 16%, transparent),
    0 0 0 2px color-mix(in srgb, var(--color-accent) 62%, transparent),
    0 22px 46px -24px color-mix(in srgb, var(--color-accent) 62%, black);
}

.movies-home__hero-loop--dragging .movies-home__hero-poster-wrap {
  transition: none;
}

.movies-home__hero-poster {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: cover;
  transition: transform var(--duration-base) var(--ease);
}

.movies-home__hero-poster--empty {
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
}

.movies-home__hero-mobile {
  display: none;
}

@media (max-width: 1120px) {
  .movies-home__hero-desktop {
    gap: var(--space-xl);
    grid-template-columns: minmax(264px, 0.86fr) minmax(360px, 1fr);
    padding-inline: var(--space-xl);
  }

  .movies-home__hero-copy h1 {
    font-size: calc(var(--font-size-2xl) * 2);
  }

  .movies-home__hero-loop .movies-home__hero-slide {
    flex-basis: clamp(112px, 22%, 164px);
  }
}

@media (max-width: 760px) {
  .movies-home__hero-desktop {
    display: none;
  }

  .movies-home__hero {
    block-size: auto;
    min-block-size: 0;
    padding-block-end: var(--space-lg);
    padding-block-start: calc(
      var(--movies-toolbar-content-offset, var(--control-height-md)) + var(--space-md)
    );
  }

  .movies-home__hero-backdrop {
    filter: blur(18px) saturate(1.18) contrast(1.04) brightness(0.66);
    transform: scale(1.08);
  }

  .movies-home__hero-edge {
    display: none;
  }

  .movies-home__hero-mobile {
    --movies-home-hero-card-width: clamp(220px, 64vw, 292px);
    --movies-home-hero-slider-fade: clamp(24px, 12vw, 52px);
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
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    overscroll-behavior-x: contain;
  }

  .movies-home__hero-mobile .movies-home__hero-track {
    display: flex;
    gap: var(--space-lg);
    list-style: none;
    margin: 0;
    padding: var(--space-xs) var(--movies-home-hero-side-padding) var(--space-md);
    touch-action: pan-y pinch-zoom;
  }

  .movies-home__hero-slide {
    flex: 0 0 var(--movies-home-hero-card-width);
    min-inline-size: 0;
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
    outline: 0;
  }

  .movies-home__hero-poster-wrap {
    aspect-ratio: 2 / 3;
    background: color-mix(in srgb, var(--color-fg) 10%, transparent);
    border: 2px solid color-mix(in srgb, var(--color-fg) 38%, transparent);
    border-radius: 8px;
    box-shadow: none;
    display: block;
    overflow: hidden;
    position: relative;
    transition:
      filter var(--duration-base) var(--ease),
      opacity var(--duration-base) var(--ease);
  }

  .movies-home__hero-slide:not(.movies-home__hero-slide--active) .movies-home__hero-poster-wrap {
    filter: saturate(0.8) brightness(0.76);
    opacity: 0.74;
  }

  .movies-home__hero-slide--active .movies-home__hero-poster-wrap {
    filter: none;
    opacity: 1;
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
  .movies-home__hero-meta,
  .movies-home__hero-eyebrow {
    margin: 0;
  }

  .movies-home__hero-copy h1 {
    font-size: var(--font-size-2xl);
    line-height: var(--leading-tight);
  }

  .movies-home__hero-meta {
    color: color-mix(in srgb, var(--color-fg) 78%, transparent);
    font-size: var(--font-size-sm);
    line-height: var(--leading-snug);
  }

  .movies-home__hero-actions {
    justify-content: center;
    padding-block-start: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .movies-home__hero-poster,
  .movies-home__hero-poster-wrap {
    transition: none;
  }
}
</style>
