<script setup lang="ts">
import { AppFrame, ActionRow, FormField, Select, useAppChrome } from "@daopk/kit";
import type { SelectOption } from "@daopk/kit";
import { Button, Dialog, DialogActions, Slider, Switch } from "@daopk/ui";
import { RotateCcw, Sparkles } from "@daopk/icons";

import {
  type BabyTouchIntensity,
  type BabyTouchPoint,
  type BabyTouchScene,
  type BabyTouchSticker,
  useBabyTouch,
} from "./useBabyTouch";

useAppChrome({ title: () => "Baby Touch" });

const sceneOptions: readonly SelectOption[] = [
  { value: "mix", label: "Mix" },
  { value: "animals", label: "Animals" },
  { value: "shapes", label: "Shapes" },
  { value: "bubbles", label: "Bubbles" },
];

const intensityOptions: readonly SelectOption[] = [
  { value: "gentle", label: "Gentle" },
  { value: "lively", label: "Lively" },
];

const {
  activeCount,
  clearStickers,
  closeSettings,
  handleParentCornerDown,
  handleParentCornerUp,
  playTapTone,
  resetSettings,
  settings,
  settingsLabel,
  settingsOpen,
  spawnSticker,
  stickers,
  updateSettings,
} = useBabyTouch();

function isScene(value: string): value is BabyTouchScene {
  return sceneOptions.some((option) => option.value === value);
}

function isIntensity(value: string): value is BabyTouchIntensity {
  return intensityOptions.some((option) => option.value === value);
}

function pointFromPointerEvent(event: PointerEvent): BabyTouchPoint {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  return {
    x: rect.width <= 0 ? 0.5 : (event.clientX - rect.left) / rect.width,
    y: rect.height <= 0 ? 0.5 : (event.clientY - rect.top) / rect.height,
  };
}

function capturePointer(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  try {
    target.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail in test DOMs and after some touch cancellations.
  }
}

function releasePointer(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  try {
    target.releasePointerCapture(event.pointerId);
  } catch {
    // Matching the capture fallback above keeps cancellation paths quiet.
  }
}

function onPointerDown(event: PointerEvent): void {
  if (settingsOpen.value) {
    return;
  }

  const point = pointFromPointerEvent(event);
  capturePointer(event);
  event.preventDefault();

  if (handleParentCornerDown(event.pointerId, point)) {
    return;
  }

  const sticker = spawnSticker(point);
  playTapTone(sticker);
}

function onPointerEnd(event: PointerEvent): void {
  handleParentCornerUp(event.pointerId);
  releasePointer(event);
}

function setScene(next: string): void {
  if (isScene(next)) {
    updateSettings({ scene: next });
  }
}

function setIntensity(next: string): void {
  if (isIntensity(next)) {
    updateSettings({ intensity: next });
  }
}

function setSoundEnabled(next: boolean): void {
  updateSettings({ soundEnabled: next });
}

function setVolume(next: number): void {
  updateSettings({ volume: next });
}

function stickerStyle(sticker: BabyTouchSticker): Record<string, string> {
  return {
    "--baby-touch-x": `${sticker.x * 100}%`,
    "--baby-touch-y": `${sticker.y * 100}%`,
    "--baby-touch-hue": `${sticker.hue}deg`,
    "--baby-touch-spin": `${sticker.spin}deg`,
    "--baby-touch-scale": String(sticker.scale),
    "--baby-touch-mirror": sticker.mirror ? "-1" : "1",
    "--baby-touch-lifetime": `${sticker.lifetimeMs}ms`,
  };
}
</script>

<template>
  <AppFrame
    as="main"
    class="baby-touch"
    :class="[`baby-touch--${settings.intensity}`]"
    layout="block"
    :safe-area="false"
    aria-label="Baby Touch"
  >
    <section
      class="baby-touch__play-surface"
      data-testid="baby-touch-surface"
      :aria-label="settingsLabel"
      @pointerdown="onPointerDown"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @lostpointercapture="onPointerEnd"
      @contextmenu.prevent
      @dragstart.prevent
    >
      <div class="baby-touch__stage" aria-hidden="true">
        <div
          v-for="sticker in stickers"
          :key="sticker.id"
          class="baby-touch__sticker"
          :class="[
            `baby-touch__sticker--${sticker.family}`,
            `baby-touch__sticker--${sticker.kind}`,
          ]"
          :style="stickerStyle(sticker)"
          data-testid="baby-touch-sticker"
        >
          <svg
            v-if="sticker.family === 'animal'"
            class="baby-touch__sticker-art"
            viewBox="0 0 120 120"
            focusable="false"
            aria-hidden="true"
          >
            <circle
              v-if="sticker.kind === 'lion'"
              class="baby-touch__animal-mane"
              cx="60"
              cy="60"
              r="48"
            />
            <circle
              v-if="sticker.kind !== 'frog'"
              class="baby-touch__animal-ear baby-touch__animal-ear--left"
              cx="34"
              cy="34"
              r="18"
            />
            <circle
              v-if="sticker.kind !== 'frog'"
              class="baby-touch__animal-ear baby-touch__animal-ear--right"
              cx="86"
              cy="34"
              r="18"
            />
            <ellipse
              v-if="sticker.kind === 'frog'"
              class="baby-touch__animal-ear baby-touch__animal-ear--left"
              cx="36"
              cy="38"
              rx="18"
              ry="22"
            />
            <ellipse
              v-if="sticker.kind === 'frog'"
              class="baby-touch__animal-ear baby-touch__animal-ear--right"
              cx="84"
              cy="38"
              rx="18"
              ry="22"
            />
            <circle class="baby-touch__animal-face" cx="60" cy="62" r="40" />
            <path
              v-if="sticker.kind === 'cat'"
              class="baby-touch__animal-mark"
              d="M46 24 34 48 58 40ZM74 40l24 8L74 24Z"
            />
            <circle class="baby-touch__animal-eye" cx="46" cy="58" r="5" />
            <circle class="baby-touch__animal-eye" cx="74" cy="58" r="5" />
            <ellipse class="baby-touch__animal-muzzle" cx="60" cy="74" rx="18" ry="12" />
            <path class="baby-touch__animal-smile" d="M49 75q11 12 22 0" />
            <circle class="baby-touch__animal-nose" cx="60" cy="68" r="4" />
            <circle class="baby-touch__animal-shine" cx="43" cy="43" r="8" />
          </svg>

          <svg
            v-else-if="sticker.family === 'shape'"
            class="baby-touch__sticker-art"
            viewBox="0 0 120 120"
            focusable="false"
            aria-hidden="true"
          >
            <path
              v-if="sticker.kind === 'star'"
              class="baby-touch__shape-main"
              d="m60 12 13 31 34 3-26 22 8 34-29-18-29 18 8-34-26-22 34-3Z"
            />
            <path
              v-else-if="sticker.kind === 'heart'"
              class="baby-touch__shape-main"
              d="M60 100S18 76 18 43c0-16 11-27 26-27 8 0 14 4 16 10 2-6 8-10 16-10 15 0 26 11 26 27 0 33-42 57-42 57"
            />
            <path
              v-else-if="sticker.kind === 'moon'"
              class="baby-touch__shape-main"
              d="M82 92A42 42 0 0 1 60 14a38 38 0 1 0 28 68 42 42 0 0 1-6 10"
            />
            <path
              v-else
              class="baby-touch__shape-main"
              d="M60 16c18 0 34 15 34 33 0 29-34 55-34 55S26 78 26 49c0-18 16-33 34-33"
            />
            <circle
              class="baby-touch__shape-dot baby-touch__shape-dot--one"
              cx="39"
              cy="42"
              r="6"
            />
            <circle
              class="baby-touch__shape-dot baby-touch__shape-dot--two"
              cx="79"
              cy="70"
              r="5"
            />
          </svg>

          <svg
            v-else
            class="baby-touch__sticker-art"
            viewBox="0 0 120 120"
            focusable="false"
            aria-hidden="true"
          >
            <circle class="baby-touch__bubble-main" cx="58" cy="60" r="42" />
            <circle
              v-if="sticker.kind !== 'ring'"
              class="baby-touch__bubble-secondary"
              cx="86"
              cy="36"
              r="17"
            />
            <circle
              v-if="sticker.kind === 'double-bubble'"
              class="baby-touch__bubble-secondary baby-touch__bubble-secondary--low"
              cx="32"
              cy="80"
              r="20"
            />
            <circle class="baby-touch__bubble-shine" cx="43" cy="42" r="10" />
            <path class="baby-touch__bubble-glint" d="M74 28q10 4 14 14" />
          </svg>

          <span class="baby-touch__sparkle baby-touch__sparkle--one" />
          <span class="baby-touch__sparkle baby-touch__sparkle--two" />
          <span class="baby-touch__sparkle baby-touch__sparkle--three" />
        </div>
      </div>

      <p class="baby-touch__status" aria-live="polite">{{ activeCount }}</p>
    </section>

    <Dialog
      :open="settingsOpen"
      title="Parent settings"
      description="Tune the play surface for a calmer or livelier session."
      variant="sheet"
      @update:open="settingsOpen = $event"
      @close="closeSettings"
    >
      <div class="baby-touch__settings" data-testid="baby-touch-settings">
        <FormField label="Scene">
          <Select
            :model-value="settings.scene"
            :options="sceneOptions"
            @update:model-value="setScene"
          />
        </FormField>

        <FormField label="Animation">
          <Select
            :model-value="settings.intensity"
            :options="intensityOptions"
            @update:model-value="setIntensity"
          />
        </FormField>

        <ActionRow title="Sound" description="Soft tones are off by default.">
          <Switch :model-value="settings.soundEnabled" @update:model-value="setSoundEnabled" />
        </ActionRow>

        <FormField label="Volume" :hint="`${settings.volume}%`">
          <Slider
            :model-value="settings.volume"
            :disabled="!settings.soundEnabled"
            :aria-label="'Volume'"
            :aria-valuetext="`${settings.volume}%`"
            @update:model-value="setVolume"
          />
        </FormField>

        <DialogActions align="between">
          <Button variant="secondary" :icon-start="RotateCcw" @click="resetSettings">
            Reset
          </Button>
          <div class="baby-touch__settings-actions">
            <Button variant="secondary" :icon-start="Sparkles" @click="clearStickers">
              Clear
            </Button>
            <Button variant="primary" @click="closeSettings">Done</Button>
          </div>
        </DialogActions>
      </div>
    </Dialog>
  </AppFrame>
</template>

<style scoped lang="scss">
.baby-touch {
  background:
    radial-gradient(circle at 18% 20%, hsl(48 100% 86% / 0.85), transparent 28%),
    radial-gradient(circle at 82% 18%, hsl(337 88% 88% / 0.75), transparent 30%),
    linear-gradient(
      125deg,
      hsl(191 66% 86%) 0 16%,
      hsl(52 100% 88%) 16% 30%,
      hsl(333 74% 91%) 30% 43%,
      hsl(27 86% 88%) 43% 56%,
      hsl(199 68% 87%) 56% 72%,
      hsl(136 63% 88%) 72% 86%,
      hsl(262 71% 91%) 86% 100%
    );
  block-size: 100%;
  color: var(--color-fg);
  overflow: hidden;
}

.baby-touch__play-surface {
  block-size: 100%;
  cursor: crosshair;
  inline-size: 100%;
  overflow: hidden;
  position: relative;
  touch-action: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
}

.baby-touch__stage {
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: absolute;
}

.baby-touch__sticker {
  --baby-touch-size: 112px;

  animation: baby-touch-pop var(--baby-touch-lifetime) var(--ease) both;
  block-size: var(--baby-touch-size);
  filter: drop-shadow(0 10px 14px rgb(18 18 26 / 0.18));
  inline-size: var(--baby-touch-size);
  inset-block-start: var(--baby-touch-y);
  inset-inline-start: var(--baby-touch-x);
  position: absolute;
  transform-origin: center;
  will-change: opacity, transform;
}

.baby-touch--lively .baby-touch__sticker {
  --baby-touch-size: 126px;
}

.baby-touch__sticker-art {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  overflow: visible;
}

.baby-touch__animal-face,
.baby-touch__animal-ear {
  fill: hsl(var(--baby-touch-hue) 78% 74%);
  stroke: rgb(255 255 255 / 0.92);
  stroke-linejoin: round;
  stroke-width: 5;
}

.baby-touch__animal-mane {
  fill: hsl(calc(var(--baby-touch-hue) + 34deg) 88% 66%);
  stroke: rgb(255 255 255 / 0.88);
  stroke-width: 5;
}

.baby-touch__animal-mark {
  fill: hsl(calc(var(--baby-touch-hue) + 28deg) 82% 64%);
}

.baby-touch__animal-eye,
.baby-touch__animal-nose {
  fill: rgb(18 18 26 / 0.9);
}

.baby-touch__animal-muzzle {
  fill: rgb(255 255 255 / 0.76);
}

.baby-touch__animal-smile {
  fill: none;
  stroke: rgb(18 18 26 / 0.72);
  stroke-linecap: round;
  stroke-width: 4;
}

.baby-touch__animal-shine {
  fill: rgb(255 255 255 / 0.38);
}

.baby-touch__shape-main {
  fill: hsl(var(--baby-touch-hue) 86% 70%);
  stroke: rgb(255 255 255 / 0.92);
  stroke-linejoin: round;
  stroke-width: 6;
}

.baby-touch__shape-dot {
  fill: rgb(255 255 255 / 0.58);
}

.baby-touch__shape-dot--two {
  fill: hsl(calc(var(--baby-touch-hue) + 64deg) 92% 82% / 0.9);
}

.baby-touch__bubble-main,
.baby-touch__bubble-secondary {
  fill: hsl(var(--baby-touch-hue) 92% 82% / 0.36);
  stroke: rgb(255 255 255 / 0.92);
  stroke-width: 5;
}

.baby-touch__bubble-shine {
  fill: rgb(255 255 255 / 0.58);
}

.baby-touch__bubble-glint {
  fill: none;
  stroke: rgb(255 255 255 / 0.7);
  stroke-linecap: round;
  stroke-width: 5;
}

.baby-touch__sparkle {
  background: rgb(255 255 255 / 0.92);
  block-size: 9px;
  border-radius: var(--radius-full);
  box-shadow: 0 0 16px rgb(255 255 255 / 0.9);
  inline-size: 9px;
  position: absolute;
}

.baby-touch__sparkle--one {
  inset-block-start: 8%;
  inset-inline-start: 10%;
}

.baby-touch__sparkle--two {
  block-size: 7px;
  inline-size: 7px;
  inset-block-start: 20%;
  inset-inline-end: 4%;
}

.baby-touch__sparkle--three {
  block-size: 6px;
  inline-size: 6px;
  inset-block-end: 17%;
  inset-inline-start: 5%;
}

.baby-touch__status {
  block-size: 1px;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  inline-size: 1px;
  margin: -1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.baby-touch__settings {
  display: grid;
  gap: var(--space-md);
}

.baby-touch__settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: flex-end;
}

@keyframes baby-touch-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35) rotate(0deg) scaleX(var(--baby-touch-mirror));
  }
  14% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(calc(var(--baby-touch-scale) * 1.08))
      rotate(var(--baby-touch-spin)) scaleX(var(--baby-touch-mirror));
  }
  72% {
    opacity: 1;
    transform: translate(-50%, calc(-50% - 20px)) scale(var(--baby-touch-scale))
      rotate(var(--baby-touch-spin)) scaleX(var(--baby-touch-mirror));
  }
  100% {
    opacity: 0;
    transform: translate(-50%, calc(-50% - 34px)) scale(calc(var(--baby-touch-scale) * 0.86))
      rotate(var(--baby-touch-spin)) scaleX(var(--baby-touch-mirror));
  }
}

@media (max-width: 520px) {
  .baby-touch__sticker {
    --baby-touch-size: 92px;
  }

  .baby-touch--lively .baby-touch__sticker {
    --baby-touch-size: 104px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .baby-touch__sticker {
    animation-name: baby-touch-soft-fade;
  }
}

@keyframes baby-touch-soft-fade {
  0%,
  70% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(var(--baby-touch-scale)) rotate(var(--baby-touch-spin))
      scaleX(var(--baby-touch-mirror));
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(var(--baby-touch-scale)) rotate(var(--baby-touch-spin))
      scaleX(var(--baby-touch-mirror));
  }
}
</style>
