<script setup lang="ts">
import { X as DismissIcon } from "~/icons/lucide";
import { type Component, computed } from "vue";

import AppIcon from "~/components/AppIcon.vue";

const props = defineProps<{
  frameId: string;
  handleId: string;
  manifestId: string;
  name: string;
  icon: Component;
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

function onDismiss(event: MouseEvent): void {
  event.stopPropagation();
  emit("dismiss", props.frameId);
}
</script>

<template>
  <div
    class="app-switcher-card"
    role="button"
    tabindex="0"
    :aria-label="selectLabel"
    :data-frame-id="frameId"
    :data-handle-id="handleId"
    :data-manifest-id="manifestId"
    @click="onSelect"
    @keydown.enter.prevent="onSelect"
    @keydown.space.prevent="onSelect"
  >
    <span class="app-switcher-card__icon" aria-hidden="true">
      <AppIcon :icon="icon" :size="20" :stroke-width="1.75" />
    </span>
    <span class="app-switcher-card__name">{{ name }}</span>
    <button
      type="button"
      class="app-switcher-card__dismiss"
      :aria-label="dismissLabel"
      @click="onDismiss"
      @pointerdown.stop
    >
      <DismissIcon :size="18" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.app-switcher-card {
  align-items: center;
  background: var(--app-switcher-card-bg);
  border: 1px solid var(--app-switcher-card-border);
  border-radius: var(--app-switcher-card-radius);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-md);
  grid-template-columns: auto 1fr auto;
  padding: var(--app-switcher-card-padding);
  text-align: start;
  transition:
    transform var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease);

  &:hover,
  &:focus-visible {
    box-shadow: var(--shadow-sm);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  &:active {
    transform: scale(0.985);
  }
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
