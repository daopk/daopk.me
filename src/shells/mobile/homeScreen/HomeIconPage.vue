<script setup vapor lang="ts">
import { ref } from "vue";

import type { MobileManifest } from "../useMobileManifestProjection";
import HomeScreenIcon from "./HomeScreenIcon.vue";

withDefaults(
  defineProps<{
    manifests?: readonly MobileManifest[];
    launchingManifestIds?: ReadonlySet<string>;
  }>(),
  {
    manifests: () => [],
    launchingManifestIds: () => new Set<string>(),
  },
);

const emit = defineEmits<{
  (e: "launch", manifestId: string): void;
}>();

function onLaunch(manifestId: string): void {
  emit("launch", manifestId);
}

const scrollEl = ref<HTMLElement | null>(null);

defineExpose({ scrollEl });
</script>

<template>
  <div ref="scrollEl" class="home-icon-page">
    <section v-if="manifests.length === 0" class="home-icon-page__empty" role="status">
      <p>No apps registered yet.</p>
    </section>
    <div v-else class="home-icon-page__grid">
      <HomeScreenIcon
        v-for="manifest in manifests"
        :key="manifest.id"
        :manifest="manifest"
        :launching="launchingManifestIds.has(manifest.id)"
        @launch="onLaunch"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-icon-page {
  block-size: 100%;
  inline-size: 100%;
  // `overscroll-behavior: contain` defeats iOS Safari pull-to-refresh
  overscroll-behavior: contain;
  overflow-y: auto;
  padding-block-end: calc(
    var(--home-screen-padding-block) + 96px + var(--mobile-shell-safe-area-bottom, 0px)
  );
  padding-block-start: calc(
    var(--home-screen-padding-block) + var(--mobile-shell-safe-area-top, 0px)
  );
  padding-inline-end: calc(
    var(--home-screen-padding-inline) + var(--mobile-shell-safe-area-right, 0px)
  );
  padding-inline-start: calc(
    var(--home-screen-padding-inline) + var(--mobile-shell-safe-area-left, 0px)
  );
  position: relative;
}

.home-icon-page__grid {
  display: grid;
  gap: var(--home-screen-grid-gap-y) var(--home-screen-grid-gap-x);
  grid-template-columns: repeat(
    auto-fill,
    minmax(calc(var(--home-screen-icon-size) + var(--home-screen-grid-gap-x)), 1fr)
  );
  justify-items: center;
}

.home-icon-page__empty {
  color: var(--color-fg-muted);
  font-size: 14px;
  padding-block-start: var(--space-xl);
  text-align: center;
}
</style>
