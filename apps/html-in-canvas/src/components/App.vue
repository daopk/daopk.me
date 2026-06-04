<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

import { AppFrame, ScrollArea, StatusBanner, TextInput, useAppChrome } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { Copy } from "@daopk/icons";

import { detectHtmlInCanvasCaptureSupport } from "../engine/capture/captureSupport";

const FLAG_URL = "chrome://flags/#canvas-draw-element";
const COPY_STATE_RESET_MS = 1800;

useAppChrome({ title: () => "Canvas Demos" });

const support = ref(detectHtmlInCanvasCaptureSupport());
const copyState = ref<"idle" | "copied" | "failed">("idle");
const flagInput = ref<{ select: () => void } | null>(null);
let copyStateResetTimer: number | null = null;
const missingFeatureLabel = computed(() =>
  support.value.missingFeatures.length === 0
    ? "No missing features detected."
    : support.value.missingFeatures.join(", "),
);
const copyLabel = computed(() => {
  if (copyState.value === "copied") return "Copied";
  if (copyState.value === "failed") return "Copy failed";
  return "Copy flag";
});

function refreshSupport(): void {
  support.value = detectHtmlInCanvasCaptureSupport();
}

function selectFlagUrl(): void {
  flagInput.value?.select();
}

function clearCopyStateResetTimer(): void {
  if (copyStateResetTimer === null) {
    return;
  }

  window.clearTimeout(copyStateResetTimer);
  copyStateResetTimer = null;
}

function scheduleCopyStateReset(): void {
  clearCopyStateResetTimer();
  copyStateResetTimer = window.setTimeout(() => {
    copyState.value = "idle";
    copyStateResetTimer = null;
  }, COPY_STATE_RESET_MS);
}

function copyWithTextArea(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.className = "html-in-canvas__copy-source";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function copyFlagUrl(): Promise<void> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(FLAG_URL);
    } else if (!copyWithTextArea(FLAG_URL)) {
      throw new Error("Clipboard copy failed.");
    }
    copyState.value = "copied";
  } catch {
    copyState.value = "failed";
  }

  scheduleCopyStateReset();
}

onUnmounted(clearCopyStateResetTimer);
</script>

<template>
  <AppFrame
    class="html-in-canvas"
    layout="flex-column"
    :safe-area="false"
    aria-label="Canvas Demos"
  >
    <ScrollArea as="main" class="html-in-canvas__body" safe-area>
      <section class="html-in-canvas__panel" aria-labelledby="html-in-canvas-title">
        <p class="html-in-canvas__eyebrow">Desktop widget</p>
        <h1 id="html-in-canvas-title">Canvas demos setup required</h1>

        <StatusBanner
          class="html-in-canvas__status"
          :tone="support.supported ? 'success' : 'warning'"
        >
          {{
            support.supported
              ? "Canvas demos are ready. Add a desktop widget to run an effect."
              : "Enable this flag in Chrome or Chrome Canary, then restart the browser."
          }}
        </StatusBanner>

        <p class="html-in-canvas__missing">Missing: {{ missingFeatureLabel }}</p>

        <ol class="html-in-canvas__steps">
          <li>Open the flag URL below.</li>
          <li>Set Canvas drawElement to Enabled.</li>
          <li>Restart Chrome, then click the widget again.</li>
        </ol>

        <div class="html-in-canvas__flag-tools">
          <TextInput
            ref="flagInput"
            class="html-in-canvas__flag-input"
            :model-value="FLAG_URL"
            readonly
            aria-label="Canvas demos flag URL"
            @click="selectFlagUrl"
            @focus="selectFlagUrl"
          />
          <Button
            class="html-in-canvas__copy-button"
            size="sm"
            :icon-start="Copy"
            @click="copyFlagUrl"
          >
            {{ copyLabel }}
          </Button>
        </div>

        <Button variant="ghost" size="sm" @click="refreshSupport">Check again</Button>
      </section>
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss">
.html-in-canvas {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-accent) 10%, transparent),
      transparent 48%
    ),
    var(--color-bg);
}

.html-in-canvas__body {
  min-block-size: 0;
}

.html-in-canvas__panel {
  display: grid;
  gap: var(--space-md);
  margin-inline: auto;
  max-inline-size: 560px;
  min-block-size: 100%;
  padding: var(--space-xl);
  place-content: center;
}

.html-in-canvas__eyebrow {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-tight);
  margin: 0;
  text-transform: uppercase;
}

.html-in-canvas__panel h1 {
  font-size: var(--font-size-2xl);
  line-height: var(--leading-tight);
  margin: 0;
}

.html-in-canvas__status {
  max-inline-size: 100%;
}

.html-in-canvas__missing,
.html-in-canvas__steps {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  margin: 0;
}

.html-in-canvas__steps {
  padding-inline-start: 1.25rem;
}

.html-in-canvas__flag-tools {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.html-in-canvas__flag-input {
  flex: 1 1 260px;
  font-family: var(--font-family-mono, monospace);
  min-inline-size: 0;
}

:global(.html-in-canvas__copy-source) {
  block-size: 1px;
  inline-size: 1px;
  inset-block-start: 0;
  inset-inline-start: 0;
  opacity: 0;
  position: fixed;
}

@media (max-width: 560px) {
  .html-in-canvas__panel {
    padding: var(--space-lg);
  }

  .html-in-canvas__flag-tools {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
