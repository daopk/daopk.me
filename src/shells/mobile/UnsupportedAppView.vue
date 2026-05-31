<script setup lang="ts">
import { ArrowLeft } from "~/icons/lucide";
import { computed, nextTick, onMounted, ref, type Component } from "vue";

import { appUnsupportedShellMessage } from "~/core/apps/shellSupport";
import type { AppManifest } from "~/types/app";

const props = defineProps<{
  manifest: AppManifest;
}>();

const emit = defineEmits<{
  (e: "back"): void;
}>();

const backButtonRef = ref<HTMLButtonElement | null>(null);
const iconComponent = computed<Component>(() => props.manifest.icon);
const message = computed(() => {
  if (
    props.manifest.supportedShells?.length === 1 &&
    props.manifest.supportedShells[0] === "desktop"
  ) {
    return "Open it from the desktop shell.";
  }

  return appUnsupportedShellMessage(props.manifest, "mobile");
});

onMounted(() => {
  void nextTick(() => {
    backButtonRef.value?.focus({ preventScroll: true });
  });
});
</script>

<template>
  <section
    class="unsupported-app-view"
    :data-manifest-id="manifest.id"
    aria-current="page"
    aria-describedby="unsupported-app-view-copy"
    aria-labelledby="unsupported-app-view-title"
  >
    <header class="unsupported-app-view__chrome">
      <button
        ref="backButtonRef"
        type="button"
        class="unsupported-app-view__back"
        aria-label="Back to home"
        @click="emit('back')"
      >
        <ArrowLeft :size="20" :stroke-width="2.25" aria-hidden="true" />
      </button>
      <h1 class="unsupported-app-view__title">{{ manifest.name }}</h1>
    </header>
    <main class="unsupported-app-view__body">
      <div class="unsupported-app-view__glyph" aria-hidden="true">
        <component :is="iconComponent" :size="56" :stroke-width="2" />
      </div>
      <h2 id="unsupported-app-view-title" class="unsupported-app-view__heading">
        {{ manifest.name }} is not supported on mobile
      </h2>
      <p id="unsupported-app-view-copy" class="unsupported-app-view__copy">{{ message }}</p>
    </main>
  </section>
</template>

<style scoped lang="scss">
.unsupported-app-view {
  --unsupported-app-view-safe-area-top: max(0px, env(safe-area-inset-top, 0px));
  --unsupported-app-view-safe-area-right: max(0px, env(safe-area-inset-right, 0px));
  --unsupported-app-view-safe-area-bottom: max(0px, env(safe-area-inset-bottom, 0px));
  --unsupported-app-view-safe-area-left: max(0px, env(safe-area-inset-left, 0px));

  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  inset: 0;
  position: absolute;
  z-index: 3;
}

.unsupported-app-view__chrome {
  align-items: center;
  background: var(--color-bg-elevated);
  block-size: calc(48px + var(--unsupported-app-view-safe-area-top));
  border-block-end: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-sm);
  padding-block-start: var(--unsupported-app-view-safe-area-top);
  padding-inline-end: calc(var(--space-md) + var(--unsupported-app-view-safe-area-right));
  padding-inline-start: calc(var(--space-md) + var(--unsupported-app-view-safe-area-left));
}

.unsupported-app-view__back {
  align-items: center;
  background: transparent;
  border: 0;
  block-size: 36px;
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  inline-size: 36px;
  justify-content: center;
  transition: background var(--duration-fast) var(--ease);

  &:hover {
    background: var(--color-bg-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.unsupported-app-view__title {
  color: var(--color-fg);
  flex: 1 1 auto;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unsupported-app-view__body {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  min-block-size: 0;
  padding-block: var(--space-xl)
    calc(var(--space-xl) + var(--unsupported-app-view-safe-area-bottom));
  padding-inline: calc(var(--space-xl) + var(--unsupported-app-view-safe-area-left))
    calc(var(--space-xl) + var(--unsupported-app-view-safe-area-right));
  text-align: center;
}

.unsupported-app-view__glyph {
  align-items: center;
  background: var(--color-bg-elevated);
  block-size: 88px;
  border: 1px solid var(--color-border);
  border-radius: 22px;
  color: var(--color-fg-muted);
  display: inline-flex;
  filter: grayscale(1);
  inline-size: 88px;
  justify-content: center;
  margin-block-end: var(--space-lg);
  opacity: 0.72;
}

.unsupported-app-view__heading {
  font-size: 21px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.25;
  margin: 0;
  max-inline-size: 24ch;
}

.unsupported-app-view__copy {
  color: var(--color-fg-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: var(--space-sm) 0 0;
  max-inline-size: 34ch;
}

@media (prefers-reduced-motion: reduce) {
  .unsupported-app-view__back {
    transition: none;
  }
}
</style>
