<script setup vapor lang="ts">
import { nextTick, watch } from "vue";

import { Button, Overlay, Progress } from "~/components/ui";
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
    document.querySelector<HTMLButtonElement>(".boot-host__retry")?.focus();
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
    <Overlay
      class="boot-host__backdrop"
      color="color-mix(in srgb, var(--color-bg) 55%, black)"
      blur="2px"
    />

    <div class="boot-host__content">
      <p class="boot-host__wordmark">WebOS</p>

      <template v-if="isFailed()">
        <p class="boot-host__error">
          {{ props.errorMessage || "Boot failed. Check console for details." }}
        </p>
        <Button class="boot-host__retry" variant="solid" type="button" @click="onRetryClick">
          Retry
        </Button>
      </template>

      <template v-else>
        <p class="boot-host__phase">{{ props.phaseLabel || "Initializing…" }}</p>

        <div v-if="showProgressChrome()" class="boot-host__progress-wrap">
          <Progress
            class="boot-host__progress"
            :class="{
              'boot-host__progress--reduced': prefersReducedMotion() || isCancelledIdle(),
            }"
            :value="pct()"
            :min="0"
            :max="100"
            size="xs"
            radius="full"
            ariaLabel="Boot progress"
            :class-names="{
              track: 'boot-host__rail',
              indicator: 'boot-host__fill',
            }"
          />
          <div class="boot-host__rail-sheen" />
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
  background-color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-fg) 30%, transparent);
  color: var(--color-fg);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.boot-host__retry:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent-sheen) 90%, transparent);
  outline-offset: 3px;
}

.boot-host__progress-wrap {
  position: relative;
}

.boot-host__progress {
  display: block;
}

:deep(.boot-host__rail) {
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
  z-index: 1;
}

:deep(.boot-host__fill) {
  background: linear-gradient(
    90deg,
    var(--color-accent),
    color-mix(in srgb, var(--color-accent-hover) 70%, white),
    var(--color-accent)
  );
  block-size: 100%;
  box-shadow: var(--shadow-accent-sm), var(--shadow-accent-lg);
  transition:
    width var(--duration-base) var(--ease),
    opacity var(--duration-base) var(--ease);
}

.boot-host__progress--reduced :deep(.boot-host__fill) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .boot-host__content {
    transform: translateY(0);
  }

  :deep(.boot-host__fill) {
    transition: none;
  }
}
</style>
