<script setup vapor lang="ts">
import { onUnmounted, shallowRef } from "vue";

import AppIcon from "~/components/AppIcon.vue";
import { Button, DropdownMenu, DropdownMenuItem, DropdownMenuLabel } from "~/components/ui";
import Grid2X2 from "~icons/lucide/grid-2x2";
import { useKernel } from "~/composables/useKernel";
import type { AppManifest } from "~/types/app";

const kernel = useKernel();

const apps = shallowRef<readonly AppManifest[]>(visibleApps());

function refresh(): void {
  apps.value = visibleApps();
}

const stopRegistered = kernel.events.on("app.registered", refresh);
const stopUnregistered = kernel.events.on("app.unregistered", refresh);

onUnmounted(() => {
  stopRegistered();
  stopUnregistered();
});

function launchApp(
  manifestId: string,
  closeWithoutFocusRestore: (event: Event) => void,
  event: Event,
): void {
  closeWithoutFocusRestore(event);
  kernel.events.emit("app.launch.requested", { manifestId, source: "menu" });
}

function visibleApps(): AppManifest[] {
  return kernel.apps.list().filter((app) => app.hidden !== true);
}
</script>

<template>
  <span class="apps-menu-host">
    <DropdownMenu>
      <template #trigger>
        <Button
          type="button"
          class="apps-trigger"
          variant="plain"
          size="xs"
          aria-label="Applications menu"
        >
          <Grid2X2 class="apps-trigger__icon" aria-hidden="true" />
          <span>Apps</span>
        </Button>
      </template>

      <template #items="{ closeWithoutFocusRestore }">
        <DropdownMenuLabel class="ds-dropdown-menu__label">Applications</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="app in apps"
          :key="app.id"
          :text-value="app.name"
          @select="launchApp(app.id, closeWithoutFocusRestore, $event)"
        >
          <AppIcon :icon="app.icon" class="apps-menu__icon" aria-hidden="true" />
          <span>{{ app.name }}</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenu>
  </span>
</template>

<style scoped lang="scss">
.apps-menu-host {
  display: contents;
}

.apps-trigger {
  align-items: center;
  appearance: none;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--menubar-fg);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: var(--menubar-font-size);
  gap: var(--space-xs);
  letter-spacing: 0;
  margin: 0;
  block-size: calc(var(--menubar-height) - 6px);
  min-block-size: calc(var(--menubar-height) - 6px);
  padding: 0 var(--space-sm);
  transition: background-color var(--duration-fast) var(--ease);
}

.apps-trigger:hover,
.apps-trigger[data-state="open"] {
  background: var(--color-bg-subtle);
}

.apps-trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent-sheen) 75%, transparent);
  outline-offset: 2px;
}

.apps-trigger__icon {
  block-size: 13px;
  inline-size: 13px;
}

.apps-menu__icon {
  block-size: 20px;
  flex: 0 0 auto;
  inline-size: 20px;
}

@media (prefers-reduced-motion: reduce) {
  .apps-trigger {
    transition: none;
  }
}
</style>
