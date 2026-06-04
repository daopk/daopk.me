<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useKernel } from "@daopk/sdk";
import { Box, Loader2, Sparkles } from "@daopk/icons";

import { runHtmlInCanvasShardOverlay } from "../engine/cinematics/shards";
import { detectHtmlInCanvasCaptureSupport } from "../engine/capture/captureSupport";
import { useHtmlInCanvasTransition } from "../composables/useHtmlInCanvasTransition";

const AUTO_DROP_WAIT_MS = 900;

const kernel = useKernel();
const support = ref(detectHtmlInCanvasCaptureSupport());
const reducedMotion = ref(false);
const transition = useHtmlInCanvasTransition({
  reducedMotion,
  runShardOverlay: (snapshot, revealDesktop, options) =>
    runHtmlInCanvasShardOverlay(snapshot, revealDesktop, {
      ...options,
      config: { ...options.config, floatWaitTimeoutMs: AUTO_DROP_WAIT_MS },
    }),
});
let reducedMotionQuery: MediaQueryList | null = null;

const supported = computed(() => support.value.supported);
const label = computed(() =>
  transition.busy.value
    ? "Breaking glass"
    : supported.value
      ? "Break glass"
      : "Open Canvas Demos setup",
);

function syncReducedMotion(): void {
  reducedMotion.value = reducedMotionQuery?.matches ?? false;
}

onMounted(() => {
  if (typeof window.matchMedia === "function") {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    syncReducedMotion();
    reducedMotionQuery.addEventListener("change", syncReducedMotion);
  }
});

onUnmounted(() => {
  reducedMotionQuery?.removeEventListener("change", syncReducedMotion);
  reducedMotionQuery = null;
});

function refreshSupport(): void {
  support.value = detectHtmlInCanvasCaptureSupport();
}

function originForEvent(event: MouseEvent): { x: number; y: number } {
  if (event.detail > 0 && (event.clientX !== 0 || event.clientY !== 0)) {
    return { x: event.clientX, y: event.clientY };
  }

  const rect =
    event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;

  return rect === null
    ? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function openFallbackWindow(): void {
  kernel.events.emit("app.launch.requested", { manifestId: "html-in-canvas", source: "api" });
}

async function runEffect(event: MouseEvent): Promise<void> {
  refreshSupport();

  if (!support.value.supported) {
    openFallbackWindow();
    return;
  }

  await transition.start(() => undefined, {
    origin: originForEvent(event),
  });
}
</script>

<template>
  <button
    type="button"
    class="breaking-glass-widget"
    :aria-label="label"
    :aria-busy="transition.busy.value || undefined"
    :data-supported="supported || undefined"
    :data-busy="transition.busy.value || undefined"
    @click="runEffect"
  >
    <span class="breaking-glass-widget__icon" aria-hidden="true">
      <Loader2 v-if="transition.busy.value" />
      <Sparkles v-else-if="supported" />
      <Box v-else />
    </span>
    <span class="breaking-glass-widget__title">Breaking</span>
    <span class="breaking-glass-widget__subtitle">Glass</span>
  </button>
</template>

<style scoped lang="scss">
.breaking-glass-widget {
  align-items: stretch;
  appearance: none;
  background:
    radial-gradient(circle at 24% 18%, color-mix(in srgb, white 58%, transparent), transparent 26%),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--color-bg-elevated) 82%, transparent),
      color-mix(in srgb, var(--color-accent) 22%, var(--color-bg) 78%)
    );
  block-size: 100%;
  border: 1px solid color-mix(in srgb, var(--color-fg) 12%, transparent);
  border-radius: var(--radius-md);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 28%, transparent),
    0 10px 24px color-mix(in srgb, black 18%, transparent);
  box-sizing: border-box;
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  grid-template-rows: 1fr auto auto;
  inline-size: 100%;
  justify-items: start;
  letter-spacing: 0;
  overflow: hidden;
  padding: 10px;
  position: relative;
  text-align: start;
}

.breaking-glass-widget::after {
  background:
    linear-gradient(
      120deg,
      transparent 0 36%,
      color-mix(in srgb, white 40%, transparent) 37% 39%,
      transparent 40%
    ),
    linear-gradient(
      28deg,
      transparent 0 62%,
      color-mix(in srgb, white 30%, transparent) 63% 65%,
      transparent 66%
    );
  content: "";
  inset: 0;
  opacity: 0.72;
  pointer-events: none;
  position: absolute;
}

.breaking-glass-widget:hover {
  border-color: color-mix(in srgb, var(--color-accent) 56%, var(--color-border));
}

.breaking-glass-widget:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.breaking-glass-widget__icon {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-elevated) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg) 10%, transparent);
  border-radius: var(--radius-sm);
  display: inline-flex;
  inline-size: 28px;
  justify-content: center;
  min-block-size: 28px;
  position: relative;
  z-index: 1;
}

.breaking-glass-widget__icon svg {
  block-size: 16px;
  inline-size: 16px;
}

.breaking-glass-widget[data-busy] .breaking-glass-widget__icon svg {
  animation: breaking-glass-spin 820ms linear infinite;
}

.breaking-glass-widget__title,
.breaking-glass-widget__subtitle {
  position: relative;
  z-index: 1;
}

.breaking-glass-widget__title {
  font-size: 18px;
  font-weight: 720;
  line-height: 1;
}

.breaking-glass-widget__subtitle {
  color: color-mix(in srgb, var(--color-fg) 70%, transparent);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.1;
}

@keyframes breaking-glass-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .breaking-glass-widget[data-busy] .breaking-glass-widget__icon svg {
    animation: none;
  }
}
</style>
