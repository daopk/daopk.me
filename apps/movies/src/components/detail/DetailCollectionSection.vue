<script setup vapor lang="ts">
import MovieCard from "../MovieCard.vue";
import { useMoviesI18n } from "../../i18n/useMoviesI18n";
import type { MovieCollection, MovieSummary } from "../../moviesApi";

interface DetailCollectionSectionProps {
  collection: MovieCollection;
}

defineProps<DetailCollectionSectionProps>();

defineEmits<{
  "open-detail": [movie: MovieSummary];
}>();

const { t } = useMoviesI18n();
</script>

<template>
  <section class="movies-detail-section">
    <div class="movies-detail-section__heading">
      <p class="movies-detail-section__label">{{ t("movies.collection.label") }}</p>
      <h2>{{ collection.name }}</h2>
    </div>
    <p v-if="collection.overview" class="movies-detail-section__copy">
      {{ collection.overview }}
    </p>
    <ul v-if="collection.parts.length > 0" class="movies-detail-rail">
      <li v-for="part in collection.parts" :key="part.id">
        <MovieCard :movie="part" @open="$emit('open-detail', $event)" />
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.movies-detail-section {
  display: grid;
  gap: var(--space-md);
}

.movies-detail-section h2,
.movies-detail-section__heading p,
.movies-detail-section__copy {
  margin: 0;
}

.movies-detail-section h2 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
}

.movies-detail-section__heading {
  display: grid;
  gap: var(--space-2xs);
}

.movies-detail-section__label,
.movies-detail-section__copy {
  color: var(--color-fg-muted);
}

.movies-detail-section__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-detail-section__copy {
  line-height: var(--leading-relaxed);
  max-inline-size: 72ch;
}

.movies-detail-rail {
  display: grid;
  gap: var(--space-md);
  grid-auto-columns: minmax(148px, 190px);
  grid-auto-flow: column;
  list-style: none;
  margin: 0;
  overflow-x: auto;
  padding: 0 0 var(--space-sm);
  scrollbar-width: thin;
}
</style>
