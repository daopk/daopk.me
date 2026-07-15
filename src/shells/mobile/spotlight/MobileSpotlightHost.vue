<script setup lang="ts">
import { Search as SearchIcon } from "~/icons/lucide";
import { computed, ref, toRef, type CSSProperties, type Ref } from "vue";

import Spotlight from "~/components/spotlight/Spotlight.vue";
import { useGesture } from "~/composables/useGesture";
import { useReducedMotion } from "~/composables/useReducedMotion";
import { useSpotlight } from "~/composables/useSpotlight";
import type { SearchKind } from "~/types/search";

const props = defineProps<{
  scrollContainer: HTMLElement | null;
}>();

const { open, query, hits, recents, openSpotlight, closeSpotlight, setQuery, dispatch } =
  useSpotlight();
const { reduced } = useReducedMotion();

const PULL_DISTANCE_PX = 80;

const PULL_VELOCITY_PX_PER_MS = 0.3;

const pullProgress = ref(0);
const peekStyle = computed<CSSProperties>(() => ({
  opacity: pullProgress.value,
  transform: reduced.value ? "translateY(0)" : `translateY(${pullProgress.value * 12}px)`,
}));

useGesture(toRef(props, "scrollContainer") as Ref<HTMLElement | null>, {
  acceptMouse: false,
  onStart() {
    const el = props.scrollContainer;
    if (!el) return false;
    if (el.scrollTop > 0) return false;
    pullProgress.value = 0;
  },
  onMove(snapshot) {
    if (snapshot.deltaY <= 0) {
      pullProgress.value = 0;
      return;
    }
    pullProgress.value = Math.min(snapshot.deltaY / PULL_DISTANCE_PX, 1);
  },
  onEnd(snapshot) {
    const elapsed = snapshot.at - snapshot.startedAt;
    const velocity = elapsed > 0 ? snapshot.deltaY / elapsed : 0;
    const recognized = snapshot.deltaY >= PULL_DISTANCE_PX || velocity >= PULL_VELOCITY_PX_PER_MS;

    pullProgress.value = 0;
    if (recognized) {
      openSpotlight();
    }
  },
  onCancel() {
    pullProgress.value = 0;
  },
});

function onUpdateQuery(value: string): void {
  setQuery(value);
}

function onDispatch(payload: { kind: SearchKind; id: string }): void {
  void dispatch(payload.kind, payload.id);
}

function onClose(): void {
  closeSpotlight();
}

defineExpose({ openSpotlight, closeSpotlight });
</script>

<template>
  <!--
    Peek pill — visual feedback during the pull. Always present in the
    DOM so CSS can tween back to rest on gesture abandon (no
    v-if churn). `pointer-events: none` keeps icons fully tappable
    underneath. `aria-hidden` because it's a transient hint, not a
    discoverable affordance — the eventual Spotlight overlay carries
    the actual semantic role.
  -->
  <div
    class="mobile-spotlight-host__peek"
    :class="{ 'mobile-spotlight-host__peek--reduced': reduced }"
    :style="peekStyle"
    aria-hidden="true"
  >
    <span class="mobile-spotlight-host__peek-pill">
      <SearchIcon :size="14" :stroke-width="2" aria-hidden="true" />
      <span class="mobile-spotlight-host__peek-label">Search</span>
    </span>
  </div>

  <Transition name="spotlight-presence">
    <Spotlight
      v-if="open"
      :query="query"
      :hits="hits"
      :recents="recents"
      @update:query="onUpdateQuery"
      @dispatch="onDispatch"
      @close="onClose"
    />
  </Transition>
</template>

<style scoped lang="scss">
.mobile-spotlight-host__peek {
  block-size: var(--mobile-spotlight-peek-height, 32px);
  display: flex;
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline: 0;
  justify-content: center;
  pointer-events: none;
  position: absolute;
  transition:
    opacity 180ms var(--ease),
    transform 220ms var(--ease);
  will-change: opacity, transform;
  z-index: var(--spotlight-z);
}

.mobile-spotlight-host__peek--reduced {
  transition: opacity var(--duration-fast) linear;
}

.mobile-spotlight-host__peek-pill {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill, 999px);
  box-shadow: var(--shadow-sm);
  color: var(--color-fg-muted);
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  gap: var(--space-xs);
  inset-block-start: var(--space-sm);
  letter-spacing: 0.01em;
  line-height: 1;
  padding-block: 6px;
  padding-inline: var(--space-sm);
  position: relative;
}

.mobile-spotlight-host__peek-label {
  white-space: nowrap;
}
</style>
