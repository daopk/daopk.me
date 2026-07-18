<script setup vapor lang="ts">
import Icon from "~/icons/Icon.vue";
import { AppToolbar } from "@daopk/kit";
import ArrowUp from "~icons/lucide/arrow-up";
import ChevronRight from "~icons/lucide/chevron-right";
import Grid2X2 from "~icons/lucide/grid-2x2";
import List from "~icons/lucide/list";
import RefreshCw from "~icons/lucide/refresh-cw";
import { IconButton, Radio, RadioGroup } from "@daopk/ui";

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

const viewModeOptions = [
  { value: "list", label: "List", ariaLabel: "List view", icon: List },
  { value: "grid", label: "Grid", ariaLabel: "Grid view", icon: Grid2X2 },
];

function onViewModeChange(value: string | number | null): void {
  if (value === "list" || value === "grid") {
    emit("setViewMode", value);
  }
}

const viewModeRadioClassNames = {
  root: "finder__view-option",
  indicator: "finder__view-indicator",
  label: "finder__view-label",
} as const;
</script>

<template>
  <AppToolbar class="finder__toolbar" wrap>
    <template #start>
      <IconButton
        class="finder__icon-button"
        ariaLabel="Go to parent folder"
        :disabled="cwd === '/'"
        @click="emit('goUp')"
      >
        <ArrowUp aria-hidden="true" />
      </IconButton>
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
        <Icon
          v-if="index < breadcrumbs.length - 1"
          :icon="ChevronRight"
          class="finder__breadcrumb-separator"
          :size="14"
          aria-hidden="true"
        />
      </template>
    </nav>

    <template #end>
      <IconButton class="finder__icon-button" ariaLabel="Refresh folder" @click="emit('refresh')">
        <RefreshCw aria-hidden="true" />
      </IconButton>

      <RadioGroup
        class="finder__view-toggle"
        :model-value="viewMode"
        orientation="horizontal"
        ariaLabel="View mode"
        @update:model-value="onViewModeChange"
      >
        <Radio
          v-for="option in viewModeOptions"
          :key="option.value"
          :value="option.value"
          :ariaLabel="option.ariaLabel"
          :class-names="viewModeRadioClassNames"
        >
          <component :is="option.icon" aria-hidden="true" />
        </Radio>
      </RadioGroup>
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

.finder__view-toggle {
  align-items: center;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: inline-flex;
  gap: 2px;
  padding: 2px;
}

:deep(.finder__view-option) {
  border-radius: var(--radius-sm);
  min-block-size: var(--control-height-sm);
  min-inline-size: var(--control-height-sm);
  padding: 0;
}

:deep(.finder__view-option:has(input:checked)) {
  background: var(--color-bg-elevated);
  color: var(--color-accent);
}

:deep(.finder__view-indicator) {
  display: none;
}

:deep(.finder__view-label) {
  align-items: center;
  display: inline-flex;
  justify-content: center;
}
</style>
