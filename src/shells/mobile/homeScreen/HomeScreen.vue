<script setup lang="ts">
import { Layers2 } from "~/icons/lucide";
import { computed, ref } from "vue";

import HomeIconPage from "./HomeIconPage.vue";
import HomePager from "./HomePager.vue";
import HomePageIndicator from "./HomePageIndicator.vue";
import MobileWidgetsPage from "./MobileWidgetsPage.vue";

const props = withDefaults(
  defineProps<{
    recentsAvailable: boolean;
    launchingManifestIds?: ReadonlySet<string>;
  }>(),
  {
    launchingManifestIds: () => new Set<string>(),
  },
);

const emit = defineEmits<{
  (e: "launch", manifestId: string): void;
  (e: "recents"): void;
}>();

function onLaunch(manifestId: string): void {
  emit("launch", manifestId);
}

interface IconPageInstance {
  readonly scrollEl: HTMLElement | null;
}
const iconPageRef = ref<IconPageInstance | null>(null);

interface PagerInstance {
  readonly seek: (index: number) => void;
}
const pagerRef = ref<PagerInstance | null>(null);

const currentPageIndex = ref(0);
const recentsFabHidden = computed<boolean>(() => currentPageIndex.value !== 0);

function onRecents(): void {
  if (recentsFabHidden.value) {
    return;
  }
  emit("recents");
}

function onPageChange(index: number): void {
  currentPageIndex.value = index;
}

function onSeek(index: number): void {
  pagerRef.value?.seek(index);
}

const scrollEl = computed<HTMLElement | null>(() =>
  currentPageIndex.value === 0 ? (iconPageRef.value?.scrollEl ?? null) : null,
);

defineExpose({ scrollEl });
</script>

<template>
  <main class="home-screen" aria-label="Home screen">
    <h1 class="u-visually-hidden">Home</h1>
    <HomePager
      ref="pagerRef"
      class="home-screen__pager"
      :page-count="2"
      :page-labels="['Apps', 'Widgets']"
      @page-change="onPageChange"
    >
      <template #page-0>
        <HomeIconPage
          ref="iconPageRef"
          :launching-manifest-ids="launchingManifestIds"
          @launch="onLaunch"
        />
      </template>
      <template #page-1>
        <MobileWidgetsPage />
      </template>
    </HomePager>

    <HomePageIndicator
      class="home-screen__indicator"
      :page-count="2"
      :active-index="currentPageIndex"
      @seek="onSeek"
    />

    <button
      v-if="recentsAvailable"
      type="button"
      class="home-screen__recents-fab"
      :class="{ 'home-screen__recents-fab--hidden': recentsFabHidden }"
      aria-label="Open recent apps"
      :aria-hidden="recentsFabHidden ? 'true' : undefined"
      :tabindex="recentsFabHidden ? -1 : 0"
      @click="onRecents"
    >
      <Layers2 :size="20" :stroke-width="2" aria-hidden="true" />
    </button>
  </main>
</template>

<style scoped lang="scss">
.home-screen {
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  position: relative;
}

.home-screen__pager {
  flex: 1 1 auto;
  min-block-size: 0;
}

.home-screen__indicator {
  flex: 0 0 auto;
  padding-block-end: calc(var(--space-sm) + var(--mobile-shell-safe-area-bottom, 0px));
  padding-block-start: var(--space-sm);
}

.home-screen__recents-fab {
  align-items: center;
  background: var(--color-bg-elevated);
  block-size: 44px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  bottom: calc(var(--space-lg) + var(--mobile-shell-safe-area-bottom, 0px));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  inline-size: 44px;
  inset-inline-end: calc(var(--space-lg) + var(--mobile-shell-safe-area-right, 0px));
  justify-content: center;
  opacity: 1;
  position: fixed;
  transition: none;
  z-index: 2;

  &:hover {
    background: var(--color-bg-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.home-screen__recents-fab--hidden {
  opacity: 0;
  pointer-events: none;
}
</style>
