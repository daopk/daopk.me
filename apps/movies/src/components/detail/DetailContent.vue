<script setup vapor lang="ts">
import type {
  MovieDetail,
  MoviePersonCredit,
  MovieSeasonEpisode,
  MovieSummary,
} from "../../moviesApi";
import { useMoviesI18n } from "../../i18n/useMoviesI18n";
import DetailCollectionSection from "./DetailCollectionSection.vue";
import DetailFactsSection from "./DetailFactsSection.vue";
import DetailPeopleSection from "./DetailPeopleSection.vue";
import DetailSeasonsSection from "./DetailSeasonsSection.vue";

interface DetailContentProps {
  detail: MovieDetail;
}

defineProps<DetailContentProps>();

defineEmits<{
  "open-detail": [movie: MovieSummary];
  "open-episode": [episode: MovieSeasonEpisode];
  "open-person": [person: MoviePersonCredit];
}>();

const { t } = useMoviesI18n();
</script>

<template>
  <section class="movies-detail-content" :aria-label="t('movies.detail.ariaLabel')">
    <DetailFactsSection :description="detail.content" :facts="detail.facts" />

    <DetailSeasonsSection
      v-if="detail.mediaType === 'tv'"
      :episode-total="detail.episodeTotal"
      :seasons="detail.seasons"
      :tmdb-id="detail.tmdbId"
      @open-episode="$emit('open-episode', $event)"
    />

    <DetailCollectionSection
      v-if="detail.collection"
      :collection="detail.collection"
      @open-detail="$emit('open-detail', $event)"
    />

    <DetailPeopleSection
      :title="t('movies.section.cast')"
      :people="detail.cast"
      @open-person="$emit('open-person', $event)"
    />
    <DetailPeopleSection
      :title="t('movies.section.crew')"
      :people="detail.crew"
      variant="compact"
      @open-person="$emit('open-person', $event)"
    />
  </section>
</template>

<style scoped lang="scss">
.movies-detail-content {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-xl);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--space-xl) var(--movies-content-outer-padding-inline, var(--space-lg))
    clamp(var(--space-xl), 10vh, 96px);
}
</style>
