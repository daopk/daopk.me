<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { useReducedMotion } from "~/composables/useReducedMotion";

const props = defineProps<{
  pageCount: number;
  /**
   * Optional aria-labels for each page region. Falls back to `Page N`
   * when omitted. The array length must match `pageCount` if provided.
   */
  pageLabels?: readonly string[];
  storageKey?: string | null;
}>();

const emit = defineEmits<{
  (e: "page-change", index: number): void;
}>();

const STORAGE_KEY_DEFAULT = "daopk:mobile-home-page";

const scrollRoot = ref<HTMLElement | null>(null);
const currentPageIndex = ref(0);

const { reduced } = useReducedMotion();

const storageKey = computed<string | null>(() =>
  props.storageKey === undefined ? STORAGE_KEY_DEFAULT : props.storageKey,
);

function clampIndex(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const max = Math.max(0, props.pageCount - 1);
  return Math.min(Math.max(0, Math.round(raw)), max);
}

function readPersistedIndex(): number {
  const key = storageKey.value;
  if (!key || typeof sessionStorage === "undefined") return 0;

  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return clampIndex(parsed);
  } catch {
    return 0;
  }
}

function writePersistedIndex(index: number): void {
  const key = storageKey.value;
  if (!key || typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.setItem(key, String(index));
  } catch {}
}

function pageWidthFor(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 ? rect.width : 1;
}

let rafHandle: number | null = null;

function scheduleIndexUpdate(): void {
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    const el = scrollRoot.value;
    if (!el) return;
    const width = pageWidthFor(el);
    const next = clampIndex(el.scrollLeft / width);
    if (next !== currentPageIndex.value) {
      currentPageIndex.value = next;
      writePersistedIndex(next);
      emit("page-change", next);
    }
  });
}

function onScroll(): void {
  scheduleIndexUpdate();
}

function seek(index: number): void {
  const el = scrollRoot.value;
  if (!el) return;
  const target = clampIndex(index);
  const width = pageWidthFor(el);
  el.scrollTo({
    left: target * width,
    behavior: reduced.value ? ("instant" as ScrollBehavior) : "smooth",
  });
  if (currentPageIndex.value !== target) {
    currentPageIndex.value = target;
    writePersistedIndex(target);
    emit("page-change", target);
  }
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "ArrowRight") {
    ev.preventDefault();
    seek(currentPageIndex.value + 1);
  } else if (ev.key === "ArrowLeft") {
    ev.preventDefault();
    seek(currentPageIndex.value - 1);
  }
}

onMounted(() => {
  const el = scrollRoot.value;
  if (!el) return;

  const initial = readPersistedIndex();
  if (initial > 0) {
    const width = pageWidthFor(el);
    el.scrollTo({ left: initial * width, behavior: "instant" as ScrollBehavior });
    currentPageIndex.value = initial;
    emit("page-change", initial);
  }

  el.addEventListener("scroll", onScroll, { passive: true });
});

onUnmounted(() => {
  const el = scrollRoot.value;
  if (el) {
    el.removeEventListener("scroll", onScroll);
  }
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
});

watch(
  () => props.pageCount,
  (count) => {
    const clamped = clampIndex(currentPageIndex.value);
    if (clamped !== currentPageIndex.value) {
      seek(clamped);
    }
    void count;
  },
);

function labelFor(index: number): string {
  return props.pageLabels?.[index] ?? `Page ${index + 1}`;
}

defineExpose({
  currentPageIndex,
  seek,
});
</script>

<template>
  <div
    ref="scrollRoot"
    class="home-pager"
    tabindex="0"
    role="group"
    aria-roledescription="carousel"
    aria-label="Home pages"
    @keydown="onKeydown"
  >
    <div
      v-for="i in pageCount"
      :key="i - 1"
      class="home-pager__page"
      role="region"
      :aria-label="labelFor(i - 1)"
      :aria-hidden="currentPageIndex !== i - 1"
    >
      <slot :name="`page-${i - 1}`" :index="i - 1" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-pager {
  block-size: 100%;
  display: flex;
  flex-direction: row;
  inline-size: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  touch-action: pan-x pan-y;

  // wayfinding chrome. The scrollbar would clutter the bottom of the
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
}

.home-pager__page {
  block-size: 100%;
  flex: 0 0 100%;
  inline-size: 100%;
  scroll-snap-align: start;
  overflow-y: auto;
}
</style>
