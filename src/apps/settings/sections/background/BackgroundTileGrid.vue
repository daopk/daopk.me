<script setup vapor lang="ts">
import CheckIcon from "~icons/lucide/check";
import TrashIcon from "~icons/lucide/trash-2";

import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { AspectRatio, IconButton, Radio, RadioGroup } from "~/components/ui";
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
const radioClassNames = {
  indicator: "background__radio-indicator",
  label: "background__radio-label",
} as const;

function selectTile(value: string | number | null): void {
  if (value === null) return;
  const id = String(value);
  if (id !== props.activeId) emit("select", id);
}
</script>

<template>
  <RadioGroup
    class="background__grid"
    :model-value="activeId"
    aria-labelledby="background-wallpaper-label"
    @update:model-value="selectTile"
  >
    <div v-for="tile in tiles" :key="tile.id" class="background__tile-wrapper">
      <Radio
        class="background__tile"
        :class="{ 'background__tile--active': tile.id === activeId }"
        :value="tile.id"
        :aria-label="`${tile.name} — ${tile.description}`"
        :class-names="radioClassNames"
      >
        <AspectRatio
          class="background__tile-preview"
          :ratio="16 / 10"
          :style="previewStyleForTile(tile)"
          aria-hidden="true"
        />
        <span class="background__tile-meta">
          <span class="background__tile-label">{{ tile.name }}</span>
          <span class="background__tile-hint">{{ tile.description }}</span>
        </span>
        <CheckIcon v-if="tile.id === activeId" class="background__tile-check" aria-hidden="true" />
      </Radio>
      <IconButton
        v-if="tile.kind === 'user'"
        class="background__tile-remove"
        size="xs"
        variant="plain"
        :ariaLabel="t('settings.background.deleteWallpaper', { name: tile.name })"
        @click="emit('remove', tile.id, $event)"
      >
        <TrashIcon aria-hidden="true" />
      </IconButton>
    </div>
  </RadioGroup>
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

:deep(.background__radio-indicator),
:deep(.background__radio-label) {
  display: none;
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
.background__tile:has(input:focus-visible) {
  border-color: var(--color-accent);
}

.background__tile:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.background__tile--active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}

.background__tile-preview {
  align-items: center;
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
