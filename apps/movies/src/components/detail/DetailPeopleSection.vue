<script setup lang="ts">
import type { MoviePersonCredit } from "../../moviesApi";
import { useMoviesI18n } from "../../i18n/useMoviesI18n";
import PosterFrame from "../PosterFrame.vue";
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

const { t } = useMoviesI18n();
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
          <PosterFrame
            :src="person.profileUrl"
            :alt="person.name"
            image-class="movies-detail-people__image"
            empty-class="movies-detail-people__empty"
          >
            <template #empty>
              <span class="movies-detail-people__placeholder" />
            </template>
          </PosterFrame>
          <span class="movies-detail-person__copy">
            <strong>{{ person.name }}</strong>
            <span v-if="personMetaLabel(person, t)">{{ personMetaLabel(person, t) }}</span>
          </span>
        </button>
        <span v-else class="movies-detail-person">
          <PosterFrame
            :src="person.profileUrl"
            :alt="person.name"
            image-class="movies-detail-people__image"
            empty-class="movies-detail-people__empty"
          >
            <template #empty>
              <span class="movies-detail-people__placeholder" />
            </template>
          </PosterFrame>
          <span class="movies-detail-person__copy">
            <strong>{{ person.name }}</strong>
            <span v-if="personMetaLabel(person, t)">{{ personMetaLabel(person, t) }}</span>
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
          <span v-if="personMetaLabel(person, t)">{{ personMetaLabel(person, t) }}</span>
        </button>
        <span v-else class="movies-detail-person movies-detail-person--compact">
          <strong>{{ person.name }}</strong>
          <span v-if="personMetaLabel(person, t)">{{ personMetaLabel(person, t) }}</span>
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

button.movies-detail-person:hover :deep(.movies-poster-frame__image) {
  transform: scale(1.035);
}

.movies-detail-people__placeholder {
  --movies-person-placeholder-bg: color-mix(in srgb, var(--color-bg) 72%, var(--color-fg) 28%);
  --movies-person-placeholder-ink: color-mix(
    in srgb,
    var(--color-fg) 42%,
    var(--movies-person-placeholder-bg)
  );

  background:
    radial-gradient(ellipse at 50% 32%, rgb(255 255 255 / 10%), transparent 42%),
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--movies-person-placeholder-bg) 92%, white 8%),
      color-mix(in srgb, var(--movies-person-placeholder-bg) 88%, black 12%)
    );
  block-size: 100%;
  color: var(--movies-person-placeholder-ink);
  display: grid;
  inline-size: 100%;
  justify-items: center;
  overflow: hidden;
  position: relative;
}

.movies-detail-people__placeholder::before,
.movies-detail-people__placeholder::after {
  background: currentColor;
  box-shadow: 0 8px 18px rgb(0 0 0 / 8%);
  content: "";
  display: block;
  position: absolute;
  transform: translateX(-50%);
}

.movies-detail-people__placeholder::before {
  block-size: 18%;
  border-radius: var(--radius-full);
  inline-size: 27%;
  inset-block-start: 29%;
  inset-inline-start: 50%;
}

.movies-detail-people__placeholder::after {
  block-size: 31%;
  border-radius: 48% 48% 18% 18% / 42% 42% 12% 12%;
  inline-size: 58%;
  inset-block-start: 55%;
  inset-inline-start: 50%;
}

.movies-detail-person__copy,
.movies-detail-crew li,
.movies-detail-person--compact {
  display: grid;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.movies-detail-people strong,
.movies-detail-person__copy span,
.movies-detail-crew strong,
.movies-detail-crew span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.movies-detail-person__copy span,
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
