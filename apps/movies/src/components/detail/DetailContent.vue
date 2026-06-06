<script setup lang="ts">
import type {
  MovieDetail,
  MoviePersonCredit,
  MovieSeasonEpisode,
  MovieSummary,
} from "../../moviesApi";
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
</script>

<template>
  <section class="movies-detail-content" aria-label="TMDB title information">
    <DetailFactsSection :facts="detail.facts" />

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
      title="Cast"
      :people="detail.cast"
      @open-person="$emit('open-person', $event)"
    />
    <DetailPeopleSection
      title="Crew"
      :people="detail.crew"
      variant="compact"
      @open-person="$emit('open-person', $event)"
    />
  </section>
</template>

<style scoped lang="scss">
.movies-detail-content {
  display: grid;
  gap: var(--space-xl);
  margin-inline: auto;
  max-inline-size: 1100px;
  padding: var(--space-xl) var(--space-lg) clamp(var(--space-xl), 10vh, 96px);
}

@media (max-width: 700px) {
  .movies-detail-content {
    padding-inline: var(--space-md);
  }
}
</style>
