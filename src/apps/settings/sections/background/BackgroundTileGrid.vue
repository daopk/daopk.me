<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import { Check as CheckIcon, Trash2 as TrashIcon } from "~/icons/lucide";

import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { previewStyleForTile, type BackgroundTile } from "./wallpaperTiles";

const props = defineProps<{
  readonly activeId: string;
  readonly tiles: readonly BackgroundTile[];
}>();

const emit = defineEmits<{
  select: [id: string];
  remove: [id: string, event: Event];
}>();

const { t } = useSettingsI18n();
const tileButtonRefs = ref<(HTMLElement | null)[]>([]);
const focusedTileIndex = ref<number>(0);

watch(
  () => props.activeId,
  (id) => {
    const i = props.tiles.findIndex((t) => t.id === id);
    if (i >= 0) {
      focusedTileIndex.value = i;
    }
  },
  { immediate: true },
);

function setTileRef(el: Element | unknown, index: number): void {
  tileButtonRefs.value[index] = (el as HTMLElement | null) ?? null;
}

function onTileKeydown(event: KeyboardEvent, index: number): void {
  const total = props.tiles.length;
  if (total === 0) return;
  let next = -1;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown": {
      next = (index + 1) % total;
      break;
    }
    case "ArrowLeft":
    case "ArrowUp": {
      next = (index - 1 + total) % total;
      break;
    }
    case "Home": {
      next = 0;
      break;
    }
    case "End": {
      next = total - 1;
      break;
    }
    default: {
      return;
    }
  }
  event.preventDefault();
  focusedTileIndex.value = next;
  const tile = props.tiles[next];
  if (tile && tile.id !== props.activeId) {
    emit("select", tile.id);
  }
  void nextTick(() => {
    tileButtonRefs.value[next]?.focus();
  });
}
</script>

<template>
  <div class="background__grid" role="radiogroup" aria-labelledby="background-wallpaper-label">
    <div v-for="(tile, i) in tiles" :key="tile.id" class="background__tile-wrapper">
      <button
        :ref="(el) => setTileRef(el, i)"
        type="button"
        class="background__tile"
        :class="{ 'background__tile--active': tile.id === activeId }"
        role="radio"
        :aria-checked="tile.id === activeId"
        :aria-label="`${tile.name} — ${tile.description}`"
        :tabindex="i === focusedTileIndex ? 0 : -1"
        @click="emit('select', tile.id)"
        @focus="focusedTileIndex = i"
        @keydown="onTileKeydown($event, i)"
      >
        <span
          class="background__tile-preview"
          :style="previewStyleForTile(tile)"
          aria-hidden="true"
        />
        <span class="background__tile-meta">
          <span class="background__tile-label">{{ tile.name }}</span>
          <span class="background__tile-hint">{{ tile.description }}</span>
        </span>
        <CheckIcon v-if="tile.id === activeId" class="background__tile-check" aria-hidden="true" />
      </button>
      <button
        v-if="tile.kind === 'user'"
        type="button"
        class="background__tile-remove"
        :aria-label="t('settings.background.deleteWallpaper', { name: tile.name })"
        @click="(e) => emit('remove', tile.id, e)"
      >
        <TrashIcon aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.background__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fill, minmax(168px, 220px));
}

.background__tile-wrapper {
  position: relative;
}

.background__tile {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font: inherit;
  overflow: hidden;
  padding: 0;
  position: relative;
  text-align: start;
  transition:
    border-color var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);
  width: 100%;
}

.background__tile:hover,
.background__tile:focus-visible {
  border-color: var(--color-accent);
}

.background__tile:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.background__tile--active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}

.background__tile-preview {
  align-items: center;
  aspect-ratio: 16 / 10;
  background-color: var(--color-bg-subtle);
  background-position: center;
  background-size: cover;
  display: flex;
  justify-content: center;
  position: relative;
  width: 100%;
}

.background__tile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-block-size: 58px;
  min-inline-size: 0;
  padding: var(--space-sm) var(--space-md) var(--space-md);
}

.background__tile-label {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background__tile-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background__tile-check {
  background: var(--color-bg-elevated);
  block-size: 18px;
  border-radius: 50%;
  color: var(--color-accent);
  inline-size: 18px;
  inset-block-start: var(--space-sm);
  inset-inline-end: var(--space-sm);
  padding: 2px;
  position: absolute;
}

.background__tile-remove {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 70%, transparent);
  block-size: 22px;
  border: none;
  border-radius: 50%;
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  inline-size: 22px;
  inset-block-start: var(--space-sm);
  inset-inline-start: var(--space-sm);
  justify-content: center;
  opacity: 0.7;
  padding: 4px;
  position: absolute;
  transition:
    background-color var(--duration-fast) var(--ease),
    opacity var(--duration-fast) var(--ease);
}

.background__tile-wrapper:hover .background__tile-remove,
.background__tile-wrapper:focus-within .background__tile-remove,
.background__tile-remove:focus-visible {
  opacity: 1;
}

.background__tile-remove:hover,
.background__tile-remove:focus-visible {
  background: var(--color-error);
  color: var(--color-bg);
}

@container (max-width: 760px) {
  .background__grid {
    grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .background__tile,
  .background__tile-remove {
    transition: none;
  }
}
</style>
