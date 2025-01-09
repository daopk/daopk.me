<script setup lang="ts">
import { Loader2 } from "~/icons/lucide";
import { computed, type Component } from "vue";

import type { AppManifest } from "~/types/app";

const props = withDefaults(
  defineProps<{
    manifest: AppManifest;
    /**
     * True while the parent is awaiting `kernel.apps.launch` for this
     * manifest. Drives `aria-busy`, the `disabled` attribute, the
     * spinner overlay, and click-suppression. Defaults to false so
     * non-launching callers (tests, future static surfaces) work
     * unchanged.
     */
    launching?: boolean;
  }>(),
  {
    launching: false,
  },
);

const emit = defineEmits<{
  (e: "launch", manifestId: string): void;
}>();

const iconComponent = computed<Component>(() => props.manifest.icon);

function onActivate(): void {
  if (props.launching) {
    return;
  }
  emit("launch", props.manifest.id);
}
</script>

<template>
  <button
    type="button"
    class="home-icon"
    :class="{ 'home-icon--launching': launching }"
    :data-manifest-id="manifest.id"
    :aria-busy="launching ? 'true' : undefined"
    :disabled="launching || undefined"
    @click="onActivate"
    @keydown.enter.prevent="onActivate"
    @keydown.space.prevent="onActivate"
  >
    <span class="home-icon__glyph" aria-hidden="true">
      <component :is="iconComponent" :size="36" :stroke-width="2" />
      <span v-if="launching" class="home-icon__spinner" aria-hidden="true">
        <Loader2 :size="20" :stroke-width="2.25" />
      </span>
    </span>
    <span class="home-icon__label">{{ manifest.name }}</span>
  </button>
</template>

<style scoped lang="scss">
.home-icon {
  align-items: center;
  background: transparent;
  border: 0;
  color: var(--home-screen-label-fg);
  cursor: pointer;
  display: inline-flex;
  flex-direction: column;
  font-family: inherit;
  gap: var(--home-screen-label-gap);
  padding: 0;
  user-select: none;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
    border-radius: var(--home-screen-icon-radius);
  }

  // the UA's heavier disabled chrome. Cursor stays default — the
  &:disabled {
    cursor: default;
  }
}

.home-icon__glyph {
  align-items: center;
  background: var(--home-screen-icon-bg);
  block-size: var(--home-screen-icon-size);
  border-radius: var(--home-screen-icon-radius);
  box-shadow: var(--home-screen-icon-shadow);
  color: var(--color-accent);
  display: inline-flex;
  inline-size: var(--home-screen-icon-size);
  justify-content: center;
  position: relative;
  transition:
    transform var(--duration-fast) var(--ease),
    box-shadow var(--duration-fast) var(--ease),
    opacity var(--duration-fast) var(--ease);

  .home-icon:active &,
  .home-icon:focus-visible & {
    transform: scale(0.96);
  }

  .home-icon--launching & > :first-child {
    opacity: 0.35;
    transition: opacity var(--duration-fast) var(--ease);
  }
}

.home-icon__spinner {
  align-items: center;
  color: var(--color-accent);
  display: inline-flex;
  inset: 0;
  justify-content: center;
  pointer-events: none;
  position: absolute;
  transform-origin: center center;

  > svg {
    animation: home-icon-spin 900ms linear infinite;
  }
}

@keyframes home-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-icon__glyph {
    transition-duration: 0ms;
  }

  .home-icon:active .home-icon__glyph,
  .home-icon:focus-visible .home-icon__glyph {
    transform: none;
  }

  .home-icon__spinner > svg {
    animation: none;
  }
}

.home-icon__label {
  font-size: var(--home-screen-label-font-size);
  font-weight: 500;
  letter-spacing: 0.02em;
  max-inline-size: 88px;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  text-shadow: var(--home-screen-label-shadow);
  white-space: nowrap;
}
</style>
