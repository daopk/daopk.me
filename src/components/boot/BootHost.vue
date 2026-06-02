<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import type { BootStatus } from "~/types/kernel";

interface Props {
  progressFraction: number;
  phaseLabel: string;
  bootStatus: BootStatus;
  errorMessage?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  retry: [];
}>();

const retryRef = ref<HTMLButtonElement | null>(null);

const pct = (): number => Math.round(Math.min(1, Math.max(0, props.progressFraction)) * 100);

const prefersReducedMotion = (): boolean =>
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isFailed = (): boolean => props.bootStatus === "failed";

const isCancelledIdle = (): boolean => props.bootStatus === "cancelled";

const showProgressChrome = (): boolean => !isFailed();

watch(
  () => props.bootStatus === "failed",
  async (failed) => {
    if (!failed) {
      return;
    }

    await nextTick();
    retryRef.value?.focus();
  },
);

function onRetryClick(): void {
  emit("retry");
}
</script>

<template>
  <div
    class="boot-host"
    :class="{
      'boot-host--failed': isFailed(),
      'boot-host--cancelled-idle': isCancelledIdle(),
    }"
    aria-busy="true"
    aria-live="polite"
  >
    <div class="boot-host__backdrop" />

    <div class="boot-host__content">
      <p class="boot-host__wordmark">WebOS</p>

      <template v-if="isFailed()">
        <p class="boot-host__error">
          {{ props.errorMessage || "Boot failed. Check console for details." }}
        </p>
        <button ref="retryRef" class="boot-host__retry" type="button" @click="onRetryClick">
          Retry
        </button>
      </template>

      <template v-else>
        <p class="boot-host__phase">{{ props.phaseLabel || "Initializing…" }}</p>

        <div v-if="showProgressChrome()" class="boot-host__rail" aria-hidden="true">
          <div class="boot-host__rail-sheen" />

          <div
            class="boot-host__fill"
            :class="{
              'boot-host__fill--reduced-motion': prefersReducedMotion() || isCancelledIdle(),
            }"
            :style="{ inlineSize: `${pct()}%` }"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.boot-host {
  align-items: center;
  color: var(--color-fg);
  display: grid;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  inset: 0;
  block-size: 100vh;
  padding: clamp(var(--space-xl), 5vw, 48px);
  place-content: center;
  position: fixed;
}

.boot-host--failed {
  .boot-host__wordmark {
    margin-block-end: clamp(20px, 4vh, var(--space-xl));
  }
}

.boot-host__backdrop {
  backdrop-filter: blur(2px);
  background-color: color-mix(in srgb, var(--color-bg) 55%, black);
  inset: 0;
  position: absolute;
  z-index: 0;
}

.boot-host__content {
  isolation: isolate;
  max-inline-size: 420px;
  position: relative;
  text-align: center;
  width: 100%;
  z-index: 1;
}

.boot-host__wordmark {
  font-size: clamp(1.4rem, 3vw, 2rem);
  font-weight: 600;
  letter-spacing: 0.24em;
  margin: 0 0 clamp(28px, 6vh, 48px);
}

.boot-host__phase {
  color: var(--color-fg-muted);
  font-size: 0.9rem;
  letter-spacing: 0.14em;
  margin: 0 0 clamp(16px, 3vh, 22px);
  text-transform: uppercase;
}

.boot-host__error {
  color: color-mix(in srgb, var(--color-fg) 62%, transparent);
  font-size: 0.92rem;
  letter-spacing: 0.04em;
  line-height: 1.45;
  margin: 0 0 clamp(18px, 3vh, 26px);
}

.boot-host__retry {
  appearance: none;
  background-color: var(--color-accent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 30%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 0.65rem 1.35rem;
  text-transform: uppercase;
}

.boot-host__retry:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent-sheen) 90%, transparent);
  outline-offset: 3px;
}

.boot-host__rail {
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  block-size: 2px;
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}

.boot-host__rail-sheen {
  background:
    radial-gradient(
      circle at 20% center,
      color-mix(in srgb, var(--color-accent-sheen) 10%, transparent),
      transparent 62%
    ),
    linear-gradient(
      to right,
      transparent 35%,
      color-mix(in srgb, var(--color-accent-sheen) 16%, transparent) 50%,
      transparent 72%
    );
  inset: 0;
  mix-blend-mode: screen;
  pointer-events: none;
  position: absolute;
}

.boot-host__fill {
  background: linear-gradient(
    90deg,
    var(--color-accent),
    color-mix(in srgb, var(--color-accent-hover) 70%, white),
    var(--color-accent)
  );
  block-size: 100%;
  box-shadow: var(--shadow-accent-sm), var(--shadow-accent-lg);
  transform-origin: left center;
  transition:
    inline-size var(--duration-base) var(--ease),
    opacity var(--duration-base) var(--ease);
}

.boot-host__fill--reduced-motion {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .boot-host__content {
    transform: translateY(0);
  }

  .boot-host__fill {
    transition: none;
  }
}
</style>
