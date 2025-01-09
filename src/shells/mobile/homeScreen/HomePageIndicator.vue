<script setup lang="ts">
const props = defineProps<{
  /** Total dots. Must match `HomePager.pageCount`. */
  pageCount: number;
  activeIndex: number;
}>();

const emit = defineEmits<{
  (e: "seek", index: number): void;
}>();

function onClick(index: number): void {
  if (index === props.activeIndex) return;
  emit("seek", index);
}

function labelFor(index: number): string {
  return index === props.activeIndex ? `Page ${index + 1}, current page` : `Page ${index + 1}`;
}
</script>

<template>
  <div class="home-page-indicator" role="group" aria-label="Home pages">
    <button
      v-for="i in pageCount"
      :key="i - 1"
      type="button"
      class="home-page-indicator__dot"
      :class="{ 'home-page-indicator__dot--active': activeIndex === i - 1 }"
      :aria-current="activeIndex === i - 1 ? 'true' : undefined"
      :aria-label="labelFor(i - 1)"
      @click="onClick(i - 1)"
    >
      <span class="home-page-indicator__dot-glyph" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.home-page-indicator {
  align-items: center;
  display: inline-flex;
  gap: 4px;
  justify-content: center;
}

.home-page-indicator__dot {
  align-items: center;
  background: transparent;
  block-size: 24px;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  inline-size: 24px;
  justify-content: center;
  padding: 0;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 50%;
  }
}

.home-page-indicator__dot-glyph {
  background: color-mix(in srgb, var(--color-fg) 35%, transparent);
  block-size: 8px;
  border-radius: 50%;
  display: inline-block;
  inline-size: 8px;
  transition: background var(--duration-fast) var(--ease);
}

.home-page-indicator__dot--active .home-page-indicator__dot-glyph {
  background: var(--color-fg);
}
</style>
