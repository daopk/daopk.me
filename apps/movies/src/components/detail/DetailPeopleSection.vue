<script setup lang="ts">
import type { MoviePersonCredit } from "../../moviesApi";
import { personMetaLabel } from "./detailFormatters";

type PeopleVariant = "compact" | "profile";

interface DetailPeopleSectionProps {
  people: readonly MoviePersonCredit[];
  title: string;
  variant?: PeopleVariant;
}

withDefaults(defineProps<DetailPeopleSectionProps>(), {
  variant: "profile",
});

defineEmits<{
  "open-person": [person: MoviePersonCredit];
}>();
</script>

<template>
  <section v-if="people.length > 0" class="movies-detail-section">
    <h2>{{ title }}</h2>

    <ul v-if="variant === 'profile'" class="movies-detail-people">
      <li v-for="person in people" :key="person.id">
        <button
          v-if="person.tmdbId !== null"
          type="button"
          class="movies-detail-person"
          @click="$emit('open-person', person)"
        >
          <img
            v-if="person.profileUrl"
            :src="person.profileUrl"
            :alt="person.name"
            loading="lazy"
            decoding="async"
          />
          <span v-else class="movies-detail-people__empty" aria-hidden="true" />
          <span>
            <strong>{{ person.name }}</strong>
            <span v-if="personMetaLabel(person)">{{ personMetaLabel(person) }}</span>
          </span>
        </button>
        <span v-else class="movies-detail-person">
          <img
            v-if="person.profileUrl"
            :src="person.profileUrl"
            :alt="person.name"
            loading="lazy"
            decoding="async"
          />
          <span v-else class="movies-detail-people__empty" aria-hidden="true" />
          <span>
            <strong>{{ person.name }}</strong>
            <span v-if="personMetaLabel(person)">{{ personMetaLabel(person) }}</span>
          </span>
        </span>
      </li>
    </ul>

    <ul v-else class="movies-detail-crew">
      <li v-for="person in people" :key="person.id">
        <button
          v-if="person.tmdbId !== null"
          type="button"
          class="movies-detail-person movies-detail-person--compact"
          @click="$emit('open-person', person)"
        >
          <strong>{{ person.name }}</strong>
          <span v-if="personMetaLabel(person)">{{ personMetaLabel(person) }}</span>
        </button>
        <span v-else class="movies-detail-person movies-detail-person--compact">
          <strong>{{ person.name }}</strong>
          <span v-if="personMetaLabel(person)">{{ personMetaLabel(person) }}</span>
        </span>
      </li>
    </ul>
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

.movies-detail-people,
.movies-detail-crew {
  list-style: none;
  margin: 0;
  padding: 0;
}

.movies-detail-people {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
}

.movies-detail-people li,
.movies-detail-person {
  display: grid;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.movies-detail-person {
  background: transparent;
  border: 0;
  color: var(--color-fg);
  font: inherit;
  padding: 0;
  text-align: start;
}

button.movies-detail-person {
  cursor: pointer;
}

button.movies-detail-person:focus-visible {
  border-radius: var(--radius-md);
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

button.movies-detail-person:hover strong {
  color: var(--color-accent);
}

.movies-detail-people img,
.movies-detail-people__empty {
  aspect-ratio: 2 / 3;
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: 8px;
  inline-size: 100%;
  object-fit: cover;
}

.movies-detail-person > span,
.movies-detail-crew li,
.movies-detail-person--compact {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-detail-people strong,
.movies-detail-people span span,
.movies-detail-crew strong,
.movies-detail-crew span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.movies-detail-people span span,
.movies-detail-crew span {
  color: var(--color-fg-muted);
}

.movies-detail-crew {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.movies-detail-crew li {
  border-block-start: 1px solid color-mix(in srgb, var(--color-fg) 14%, transparent);
  padding-block-start: var(--space-sm);
}

@media (max-width: 700px) {
  .movies-detail-people {
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  }
}
</style>
