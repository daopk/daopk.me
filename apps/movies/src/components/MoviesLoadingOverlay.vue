<script setup vapor lang="ts">
import { Spinner } from "@daopk/kit";

import { useMoviesI18n } from "../i18n/useMoviesI18n";

const { t } = useMoviesI18n();
</script>

<template>
  <div class="movies-loading-overlay" aria-live="polite">
    <div class="movies-loading-overlay__content">
      <Spinner size="lg" :label="t('movies.loading.movies')" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.movies-loading-overlay {
  align-items: center;
  background:
    radial-gradient(
      ellipse at 22% 18%,
      color-mix(in srgb, var(--color-accent) 16%, transparent) 0%,
      transparent 42%
    ),
    radial-gradient(
      ellipse at 82% 72%,
      color-mix(in srgb, var(--color-fg) 10%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      118deg,
      transparent 0 18%,
      color-mix(in srgb, var(--color-fg) 5%, transparent) 27%,
      transparent 44%
    ),
    linear-gradient(
      148deg,
      transparent 0 34%,
      color-mix(in srgb, var(--color-accent) 7%, transparent) 48%,
      transparent 66%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-bg) 92%, var(--color-accent) 8%) 0%,
      var(--color-bg) 52%,
      color-mix(in srgb, var(--color-bg) 88%, var(--color-fg) 12%) 100%
    );
  display: flex;
  inset: 0;
  justify-content: center;
  min-block-size: 100%;
  position: absolute;
  z-index: 4;
}

.movies-loading-overlay__content {
  align-items: center;
  display: grid;
  gap: var(--space-md);
  justify-items: center;
}

.movies-loading-overlay :deep(.ds-kit-spinner) {
  block-size: 40px;
  inline-size: 40px;
}

.movies-loading-overlay :deep(.ds-kit-spinner__ring) {
  border-width: 3px;
}
</style>
