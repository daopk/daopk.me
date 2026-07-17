<script setup vapor lang="ts">
import { AppToolbar, IconButton, SegmentedControl } from "@daopk/kit";
import type { SegmentedControlOption } from "@daopk/kit";
import { ArrowUp, ChevronRight, Grid2X2, List, RefreshCw } from "@daopk/icons";

import type { FinderBreadcrumb, FinderViewMode } from "../composables/useFinder";

defineProps<{
  readonly breadcrumbs: readonly FinderBreadcrumb[];
  readonly cwd: string;
  readonly viewMode: FinderViewMode;
}>();

const emit = defineEmits<{
  breadcrumb: [path: string];
  goUp: [];
  refresh: [];
  setViewMode: [mode: FinderViewMode];
}>();

const viewModeOptions: readonly SegmentedControlOption[] = [
  { value: "list", label: "List", ariaLabel: "List view", icon: List },
  { value: "grid", label: "Grid", ariaLabel: "Grid view", icon: Grid2X2 },
];

function onViewModeChange(value: string): void {
  if (value === "list" || value === "grid") {
    emit("setViewMode", value);
  }
}
</script>

<template>
  <AppToolbar class="finder__toolbar" wrap>
    <template #start>
      <IconButton
        class="finder__icon-button"
        label="Go to parent folder"
        :icon="ArrowUp"
        :disabled="cwd === '/'"
        @click="emit('goUp')"
      />
    </template>

    <nav class="finder__breadcrumbs" aria-label="Current folder">
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
        <button
          type="button"
          class="finder__breadcrumb"
          :aria-current="crumb.path === cwd ? 'page' : undefined"
          @click="emit('breadcrumb', crumb.path)"
        >
          {{ crumb.label }}
        </button>
        <ChevronRight
          v-if="index < breadcrumbs.length - 1"
          class="finder__breadcrumb-separator"
          :size="14"
          aria-hidden="true"
        />
      </template>
    </nav>

    <template #end>
      <IconButton
        class="finder__icon-button"
        label="Refresh folder"
        :icon="RefreshCw"
        @click="emit('refresh')"
      />

      <SegmentedControl
        class="finder__view-toggle"
        :model-value="viewMode"
        :options="viewModeOptions"
        label="View mode"
        :show-labels="false"
        @update:model-value="onViewModeChange"
      />
    </template>
  </AppToolbar>
</template>

<style scoped lang="scss">
.finder__breadcrumb {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  justify-content: center;
}

.finder__breadcrumb:hover,
.finder__breadcrumb:focus-visible {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}

.finder__breadcrumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.finder__breadcrumbs {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  min-inline-size: 0;
  overflow: hidden;
}

.finder__breadcrumb {
  block-size: 30px;
  flex: 0 1 auto;
  min-inline-size: 0;
  padding: 0 var(--space-xs);
}

.finder__breadcrumb[aria-current="page"] {
  color: var(--color-fg);
  font-weight: 600;
}

.finder__breadcrumb-separator {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
}
</style>
