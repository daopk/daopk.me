<script setup lang="ts">
import { computed } from "vue";

import { ActionRow, Panel, SectionHeader } from "~/components/kit";
import Switch from "~/components/ui/Switch.vue";
import { useKernel } from "~/composables/useKernel";
import { useSettings } from "~/composables/useSettings";

const kernel = useKernel();
const settings = useSettings();

const currentDockAutoHide = computed(() => settings.dockAutoHide);

function setDockAutoHide(next: boolean): void {
  if (next === currentDockAutoHide.value) {
    return;
  }
  kernel.settings.set("dockAutoHide", next);
}
</script>

<template>
  <article class="dock-settings" aria-label="Dock settings">
    <SectionHeader class="dock-settings__header">
      <h2 class="dock-settings__title">Dock</h2>
      <p class="dock-settings__hint">Desktop Dock behavior for pointer-driven workspaces.</p>
    </SectionHeader>

    <Panel
      as="section"
      class="dock-settings__group"
      variant="plain"
      padding="none"
      aria-labelledby="dock-autohide-group-label"
    >
      <h3 id="dock-autohide-group-label" class="dock-settings__group-title">Visibility</h3>
      <ActionRow as="div" class="dock-settings__toggle-row">
        <template #copy>
          <span class="dock-settings__toggle-copy">
            <span id="dock-autohide-label" class="dock-settings__toggle-label">
              Automatically hide the Dock
            </span>
            <span class="dock-settings__toggle-hint">
              Reveal it by moving the pointer to the bottom edge.
            </span>
          </span>
        </template>
        <Switch
          :model-value="currentDockAutoHide"
          aria-labelledby="dock-autohide-label"
          @update:model-value="setDockAutoHide"
        />
      </ActionRow>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.dock-settings {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.dock-settings__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.dock-settings__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.dock-settings__hint {
  color: var(--color-fg-muted);
  font-size: 13px;
  margin: 0;
}

.dock-settings__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.dock-settings__group-title {
  color: var(--color-fg-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.dock-settings__toggle-row {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  padding: var(--space-md);
}

.dock-settings__toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.dock-settings__toggle-label {
  font-size: 13px;
  font-weight: 600;
}

.dock-settings__toggle-hint {
  color: var(--color-fg-muted);
  font-size: 11px;
  line-height: 1.4;
}
</style>
