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
const disabled = computed<boolean>(() => props.launching);

function onActivate(): void {
  if (disabled.value) {
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
    :disabled="disabled || undefined"
    @click="onActivate"
    @keydown.enter.prevent="onActivate"
    @keydown.space.prevent="onActivate"
  >
    <span class="home-icon__glyph" aria-hidden="true">
      <component
        :is="iconComponent"
        class="home-icon__glyph-art"
        :size="'var(--home-screen-icon-glyph-size)'"
        :stroke-width="2"
      />
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
    outline: none;
  }

  // Keep disabled styling owned by the launching state.
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
  transition: none;

  &::before {
    background: var(--home-screen-icon-press-bg);
    border-radius: var(--home-screen-icon-radius);
    content: "";
    inset: 0;
    opacity: 0;
    position: absolute;
  }

  .home-icon:active &::before,
  .home-icon:focus-visible &::before {
    opacity: 1;
  }

  .home-icon:focus-visible & {
    outline: 2px solid var(--color-accent);
    outline-offset: 3px;
  }

  .home-icon--launching & > :first-child {
    opacity: 0.35;
  }
}

.home-icon__glyph-art {
  block-size: var(--home-screen-icon-glyph-size);
  filter: var(--home-screen-icon-glyph-shadow);
  inline-size: var(--home-screen-icon-glyph-size);
  position: relative;
  z-index: 1;
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
  z-index: 2;

  > svg {
    animation: none;
  }
}

.home-icon__label {
  font-size: var(--home-screen-label-font-size);
  font-weight: 500;
  letter-spacing: 0;
  max-inline-size: 88px;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  text-shadow: var(--home-screen-label-shadow);
  white-space: nowrap;
}
</style>
