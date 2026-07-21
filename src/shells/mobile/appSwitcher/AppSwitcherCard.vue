<script setup vapor lang="ts">
import DismissIcon from "~icons/lucide/x";
import { computed, type VaporComponent } from "vue";

import AppIcon from "~/components/AppIcon.vue";
import { Button, IconButton } from "~/components/ui";

const props = defineProps<{
  frameId: string;
  handleId: string;
  manifestId: string;
  name: string;
  icon: VaporComponent;
}>();

const emit = defineEmits<{
  (e: "select", frameId: string): void;
  (e: "dismiss", frameId: string): void;
}>();

const selectLabel = computed(() => `Switch to ${props.name}, currently running`);
const dismissLabel = computed(() => `Dismiss ${props.name}`);

function onSelect(): void {
  emit("select", props.frameId);
}

function onDismiss(): void {
  emit("dismiss", props.frameId);
}
</script>

<template>
  <div
    class="app-switcher-card"
    :data-frame-id="frameId"
    :data-handle-id="handleId"
    :data-manifest-id="manifestId"
  >
    <Button
      class="app-switcher-card__select"
      :class-names="{ label: 'app-switcher-card__select-content' }"
      variant="plain"
      :aria-label="selectLabel"
      @click="onSelect"
    >
      <span class="app-switcher-card__icon" aria-hidden="true">
        <AppIcon :icon="icon" :size="20" :stroke-width="1.75" />
      </span>
      <span class="app-switcher-card__name">{{ name }}</span>
    </Button>
    <IconButton
      class="app-switcher-card__dismiss"
      :ariaLabel="dismissLabel"
      size="sm"
      variant="plain"
      @click="onDismiss"
    >
      <DismissIcon aria-hidden="true" />
    </IconButton>
  </div>
</template>

<style scoped lang="scss">
.app-switcher-card {
  align-items: center;
  background: var(--app-switcher-card-bg);
  border: 1px solid var(--app-switcher-card-border);
  border-radius: var(--app-switcher-card-radius);
  color: var(--color-fg);
  display: grid;
  gap: var(--space-md);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: var(--app-switcher-card-padding);
  transition:
    transform var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);

  &:hover,
  &:focus-within {
    box-shadow: var(--shadow-sm);
  }

  &:active {
    transform: scale(0.985);
  }
}

.app-switcher-card__select {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
  font: inherit;
  block-size: auto;
  inline-size: 100%;
  justify-content: flex-start;
  min-inline-size: 0;
  padding: 0;
  text-align: start;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

:deep(.app-switcher-card__select-content) {
  align-items: center;
  display: grid;
  gap: var(--space-md);
  grid-template-columns: auto minmax(0, 1fr);
  inline-size: 100%;
}

.app-switcher-card__icon {
  align-items: center;
  background: var(--color-bg-subtle);
  block-size: var(--app-switcher-card-icon-size);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: inline-flex;
  inline-size: var(--app-switcher-card-icon-size);
  justify-content: center;
}

.app-switcher-card__name {
  color: var(--color-fg);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-switcher-card__dismiss {
  align-items: center;
  background: transparent;
  block-size: 32px;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  inline-size: 32px;
  justify-content: center;
  transition:
    background var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);

  svg {
    block-size: 18px;
    inline-size: 18px;
  }

  &:hover {
    background: var(--color-bg-subtle);
    color: var(--color-fg);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-switcher-card {
    transition: none;

    &:active {
      transform: none;
    }
  }
}
</style>
