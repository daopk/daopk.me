<script setup vapor lang="ts">
import { ref } from "vue";

import { useKernel } from "~/composables/useKernel";

import { useHomeScreenGrid } from "./useHomeScreenGrid";
import HomeScreenIcon from "./HomeScreenIcon.vue";

withDefaults(
  defineProps<{
    launchingManifestIds?: ReadonlySet<string>;
  }>(),
  {
    launchingManifestIds: () => new Set<string>(),
  },
);

const emit = defineEmits<{
  (e: "launch", manifestId: string): void;
}>();

const kernel = useKernel();
const { slots } = useHomeScreenGrid(kernel);

function onLaunch(manifestId: string): void {
  emit("launch", manifestId);
}

const scrollEl = ref<HTMLElement | null>(null);

defineExpose({ scrollEl });
</script>

<template>
  <div ref="scrollEl" class="home-icon-page">
    <section v-if="slots.length === 0" class="home-icon-page__empty" role="status">
      <p>No apps registered yet.</p>
    </section>
    <div v-else class="home-icon-page__grid">
      <HomeScreenIcon
        v-for="slot in slots"
        :key="slot.manifest.id"
        :manifest="slot.manifest"
        :launching="launchingManifestIds.has(slot.manifest.id)"
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
