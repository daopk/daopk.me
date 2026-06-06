<script setup lang="ts">
import { computed } from "vue";

import { Play } from "@daopk/icons";
import { Button } from "@daopk/ui";

import type { MovieDetail } from "../../moviesApi";
import { detailMetaLabel } from "./detailFormatters";

interface DetailHeroProps {
  detail: MovieDetail;
}

const props = defineProps<DetailHeroProps>();

defineEmits<{
  watch: [];
}>();

const detailMeta = computed(() => detailMetaLabel(props.detail));
const canWatch = computed(() => props.detail.mediaType === "movie" && props.detail.play !== null);
</script>

<template>
  <section class="movies-detail-hero">
    <img
      v-if="detail.backdropUrl"
      class="movies-detail-hero__backdrop"
      :src="detail.backdropUrl"
      alt=""
      aria-hidden="true"
    />
    <div class="movies-detail-hero__shade" />
    <div class="movies-detail-hero__content">
      <div class="movies-detail-hero__overview">
        <img
          v-if="detail.posterUrl"
          class="movies-detail-hero__poster"
          :src="detail.posterUrl"
          :alt="detail.name"
        />
        <div class="movies-detail-hero__copy">
          <p class="movies-detail-hero__eyebrow">TMDB {{ detail.mediaType }}</p>
          <h1>{{ detail.name }}</h1>
          <p v-if="detail.originName" class="movies-detail-hero__origin">
            {{ detail.originName }}
          </p>
          <p v-if="detailMeta" class="movies-detail-hero__meta">{{ detailMeta }}</p>
          <p v-if="detail.content" class="movies-detail-hero__description">
            {{ detail.content }}
          </p>
          <div v-if="detail.genres.length > 0" class="movies-detail-hero__chips">
            <span v-for="item in detail.genres" :key="item.slug">{{ item.name }}</span>
          </div>
          <div v-if="canWatch" class="movies-detail-hero__actions">
            <Button variant="primary" :icon-start="Play" @click="$emit('watch')">Watch</Button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.movies-detail-hero {
  background: var(--color-bg);
  min-block-size: 520px;
  overflow: hidden;
  padding: calc(var(--control-height-md) + var(--space-xl)) var(--space-lg) var(--space-xl);
  position: relative;
}

.movies-detail-hero__backdrop,
.movies-detail-hero__shade {
  inset: 0;
  position: absolute;
}

.movies-detail-hero__backdrop {
  block-size: 100%;
  inline-size: 100%;
  object-fit: cover;
}

.movies-detail-hero__shade {
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-bg) 20%, transparent),
      color-mix(in srgb, var(--color-bg) 94%, transparent)
    ),
    linear-gradient(
      to right,
      color-mix(in srgb, var(--color-bg) 92%, transparent),
      color-mix(in srgb, var(--color-bg) 34%, transparent)
    );
}

.movies-detail-hero__content {
  display: grid;
  gap: var(--space-lg);
  margin-inline: auto;
  max-inline-size: 1100px;
  position: relative;
  z-index: 1;
}

.movies-detail-hero__overview {
  align-items: end;
  display: grid;
  gap: var(--space-xl);
  grid-template-columns: minmax(160px, 240px) minmax(0, 1fr);
}

.movies-detail-hero__poster {
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  inline-size: 100%;
  object-fit: cover;
}

.movies-detail-hero__copy {
  display: grid;
  gap: var(--space-sm);
}

.movies-detail-hero__eyebrow,
.movies-detail-hero__origin,
.movies-detail-hero__meta,
.movies-detail-hero__description {
  margin: 0;
}

.movies-detail-hero__eyebrow {
  color: var(--color-accent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-detail-hero__copy h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-detail-hero__origin,
.movies-detail-hero__meta {
  color: var(--color-fg-muted);
}

.movies-detail-hero__description {
  line-height: var(--leading-relaxed);
  max-inline-size: 72ch;
}

.movies-detail-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.movies-detail-hero__chips span {
  background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-fg);
  font-size: var(--font-size-xs);
  padding: var(--space-2xs) var(--space-xs);
}

.movies-detail-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding-block-start: var(--space-xs);
}

@media (max-width: 700px) {
  .movies-detail-hero__overview {
    align-items: start;
    grid-template-columns: 1fr;
  }

  .movies-detail-hero__poster {
    max-inline-size: 180px;
  }
}
</style>
