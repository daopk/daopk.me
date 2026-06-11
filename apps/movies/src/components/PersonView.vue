<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { EmptyState, ScrollArea } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { ArrowLeft } from "@daopk/icons";

import MovieCard from "./MovieCard.vue";
import MoviesLoadingOverlay from "./MoviesLoadingOverlay.vue";
import { useMoviesI18n } from "../i18n/useMoviesI18n";
import { fetchMoviePerson, type MoviePersonDetail, type MovieSummary } from "../moviesApi";

type LoadState = "loading" | "ready" | "error";

interface PersonViewProps {
  tmdbId: number;
}

const props = defineProps<PersonViewProps>();

defineEmits<{
  back: [];
  "open-detail": [movie: MovieSummary];
}>();

const person = ref<MoviePersonDetail | null>(null);
const state = ref<LoadState>("loading");
const { t } = useMoviesI18n();
let abortController: AbortController | null = null;

const subtitle = computed(() =>
  [person.value?.knownForDepartment, person.value?.placeOfBirth].filter(Boolean).join(" · "),
);

watch(
  () => props.tmdbId,
  () => {
    void loadPerson();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
});

async function loadPerson(): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();
  state.value = "loading";
  person.value = null;

  try {
    person.value = await fetchMoviePerson(props.tmdbId, {
      signal: abortController.signal,
    });
    state.value = "ready";
  } catch {
    if (abortController.signal.aborted) {
      return;
    }
    state.value = "error";
  }
}
</script>

<template>
  <ScrollArea class="movies-person" safe-area>
    <MoviesLoadingOverlay v-if="state === 'loading'" />

    <EmptyState
      v-else-if="state === 'error'"
      class="movies-person__status"
      role="alert"
      :title="t('movies.error.person.title')"
      :description="t('movies.error.person.description')"
    >
      <Button :icon-start="ArrowLeft" @click="$emit('back')">{{ t("movies.action.back") }}</Button>
    </EmptyState>

    <article v-else-if="person" class="movies-person__content">
      <header class="movies-person__header">
        <img
          v-if="person.profileUrl"
          class="movies-person__profile"
          :src="person.profileUrl"
          :alt="person.name"
          loading="eager"
          decoding="async"
        />
        <span v-else class="movies-person__profile" aria-hidden="true" />

        <div class="movies-person__intro">
          <p v-if="person.knownForDepartment" class="movies-person__eyebrow">
            {{ person.knownForDepartment }}
          </p>
          <h1>{{ person.name }}</h1>
          <p v-if="subtitle" class="movies-person__subtitle">{{ subtitle }}</p>
        </div>
      </header>

      <section v-if="person.facts.length > 0" class="movies-person__section">
        <h2>{{ t("movies.section.details") }}</h2>
        <dl class="movies-person__facts">
          <div v-for="fact in person.facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="person.biography" class="movies-person__section">
        <h2>{{ t("movies.person.biography") }}</h2>
        <p class="movies-person__biography">{{ person.biography }}</p>
      </section>

      <section v-if="person.knownFor.length > 0" class="movies-person__section">
        <h2>{{ t("movies.person.knownFor") }}</h2>
        <ul class="movies-person__grid">
          <li v-for="movie in person.knownFor" :key="movie.id">
            <MovieCard :movie="movie" @open="$emit('open-detail', $event)" />
          </li>
        </ul>
      </section>

      <section v-if="person.credits.length > 0" class="movies-person__section">
        <h2>{{ t("movies.person.credits") }}</h2>
        <ul class="movies-person__grid">
          <li v-for="movie in person.credits" :key="movie.id">
            <MovieCard :movie="movie" @open="$emit('open-detail', $event)" />
          </li>
        </ul>
      </section>
    </article>
  </ScrollArea>
</template>

<style scoped lang="scss">
.movies-person {
  block-size: 100%;
  background: var(--movies-surface-bg, var(--color-bg));
  position: relative;
}

.movies-person__status {
  box-sizing: border-box;
  margin: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    auto 0;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding-inline: var(--movies-content-outer-padding-inline, var(--space-md));
}

.movies-person__content {
  box-sizing: border-box;
  display: grid;
  gap: var(--space-xl);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--movies-content-box-max-inline-size, 1440px);
  padding: var(--movies-toolbar-content-offset, calc(var(--control-height-md) + var(--space-xl)))
    var(--movies-content-outer-padding-inline, var(--space-lg)) clamp(var(--space-xl), 10vh, 96px);
}

.movies-person__header {
  align-items: end;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
}

.movies-person__profile {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  inline-size: 100%;
  object-fit: cover;
}

.movies-person__intro {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-person__eyebrow,
.movies-person__subtitle {
  color: var(--color-fg-muted);
  margin: 0;
}

.movies-person__eyebrow {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.movies-person__intro h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-person__section {
  display: grid;
  gap: var(--space-md);
}

.movies-person__section h2 {
  font-size: var(--font-size-xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.movies-person__facts {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin: 0;
}

.movies-person__facts div {
  border-block-start: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  display: grid;
  gap: var(--space-2xs);
  padding-block-start: var(--space-sm);
}

.movies-person__facts dt {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
}

.movies-person__facts dd {
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.movies-person__biography {
  line-height: var(--leading-relaxed);
  margin: 0;
  max-inline-size: 78ch;
}

.movies-person__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-person__grid li {
  min-inline-size: 0;
}

@media (max-width: 700px) {
  .movies-person__header {
    align-items: start;
    grid-template-columns: minmax(96px, 140px) minmax(0, 1fr);
  }
}
</style>
