<script setup lang="ts">
import type { MovieFact } from "../../moviesApi";
import { useMoviesI18n } from "../../i18n/useMoviesI18n";

interface DetailFactsSectionProps {
  description?: string;
  facts: readonly MovieFact[];
}

defineProps<DetailFactsSectionProps>();

const { t } = useMoviesI18n();
</script>

<template>
  <section v-if="facts.length > 0 || description" class="movies-detail-section">
    <h2>{{ t("movies.section.details") }}</h2>
    <p v-if="description" class="movies-detail-section__description">
      {{ description }}
    </p>
    <dl v-if="facts.length > 0" class="movies-detail-facts">
      <div v-for="fact in facts" :key="fact.label">
        <dt>{{ fact.label }}</dt>
        <dd>{{ fact.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped lang="scss">
.movies-detail-section {
  display: grid;
  gap: var(--space-md);
}

.movies-detail-section h2 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-detail-section__description {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 72ch;
}

.movies-detail-facts {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin: 0;
}

.movies-detail-facts div {
  border-block-start: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  display: grid;
  gap: var(--space-2xs);
  padding-block-start: var(--space-sm);
}

.movies-detail-facts dt {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
}

.movies-detail-facts dd {
  font-weight: var(--font-weight-semibold);
  margin: 0;
}
</style>
