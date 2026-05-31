<script setup lang="ts">
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
    <section v-else class="home-icon-page__grid" aria-label="Apps">
      <HomeScreenIcon
        v-for="slot in slots"
        :key="slot.manifest.id"
        :manifest="slot.manifest"
        :launching="launchingManifestIds.has(slot.manifest.id)"
        :unavailable-reason="slot.unavailableReason"
        :unsupported="slot.unsupported"
        @launch="onLaunch"
      />
    </section>
  </div>
</template>

<style scoped lang="scss">
.home-icon-page {
  block-size: 100%;
  inline-size: 100%;
  // `overscroll-behavior: contain` defeats iOS Safari pull-to-refresh
  overscroll-behavior: contain;
  overflow-y: auto;
  padding-block: var(--home-screen-padding-block);
  padding-inline: var(--home-screen-padding-inline);
  padding-block-end: calc(var(--home-screen-padding-block) + 96px);
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
