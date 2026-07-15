<script setup vapor lang="ts">
import { ref } from "vue";

import { RopavToastProvider, RopavToastViewport } from "./ropavAdapter";
import ToastProviderBridge from "./ToastProviderBridge.vue";

const region = ref<HTMLElement | null>(null);
const toastViewportClassNames = {
  root: "ds-toast-viewport",
  item: "ds-toast-viewport__item",
  toast: "ds-toast",
  toastClose: "ds-toast__close",
} as const;

let swipeItem: HTMLElement | null = null;
let swipeStartX: number | null = null;
let swipePointerId: number | null = null;

function eventItem(event: PointerEvent): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const item = target.closest<HTMLElement>(".ds-toast-viewport__item");
  return item && region.value?.contains(item) ? item : null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const item = eventItem(event);
  if (!item) return;
  swipeItem = item;
  swipeStartX = event.clientX;
  swipePointerId = event.pointerId;
  item.dataset.swipe = "move";
  item.style.setProperty("--ds-toast-swipe-move-x", "0px");
  try {
    item.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events can expose capture without an active pointer.
  }
}

function onPointerMove(event: PointerEvent): void {
  if (swipeStartX === null || event.pointerId !== swipePointerId || !swipeItem) return;
  const distance = Math.max(0, event.clientX - swipeStartX);
  swipeItem.style.setProperty("--ds-toast-swipe-move-x", `${distance}px`);
}

function resetSwipe(event?: PointerEvent): void {
  if (event && swipeItem?.hasPointerCapture?.(event.pointerId)) {
    swipeItem.releasePointerCapture(event.pointerId);
  }
  swipeItem?.setAttribute("data-swipe", "cancel");
  swipeItem?.style.setProperty("--ds-toast-swipe-move-x", "0px");
  swipeItem = null;
  swipeStartX = null;
  swipePointerId = null;
}

function onPointerUp(event: PointerEvent): void {
  if (swipeStartX === null || event.pointerId !== swipePointerId || !swipeItem) return;
  const item = swipeItem;
  const distance = Math.max(0, event.clientX - swipeStartX);
  const threshold = Math.max(48, item.offsetWidth * 0.3);
  if (distance >= threshold) {
    item.dataset.swipe = "end";
    swipeItem = null;
    swipeStartX = null;
    swipePointerId = null;
    item.querySelector<HTMLButtonElement>(".ds-toast__close")?.click();
    return;
  }
  resetSwipe(event);
}
</script>

<template>
  <RopavToastProvider :max="5" :duration="5000" radius="md" close-label="Dismiss notification">
    <ToastProviderBridge />
    <div
      ref="region"
      role="region"
      aria-label="Notifications"
      @pointercancel="resetSwipe"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
    >
      <RopavToastViewport
        :teleport="false"
        position="bottom-right"
        label="Notification list"
        :class-names="toastViewportClassNames"
      />
    </div>
  </RopavToastProvider>
</template>

<style lang="scss">
.ds-toast-viewport {
  inset-block-end: 0;
  inset-inline-end: 0;
  max-inline-size: min(420px, calc(100vw - var(--space-lg) * 2));
  padding: var(--space-lg);
  padding-block-end: calc(var(--space-lg) + max(0px, env(safe-area-inset-bottom, 0)));
  width: 100%;
  z-index: var(--toast-z);
}

.ds-toast-viewport__item {
  touch-action: pan-y;

  &[data-swipe="move"] {
    transform: translateX(var(--ds-toast-swipe-move-x, 0));
  }

  &[data-swipe="cancel"] {
    transform: translateX(0);
    transition: transform var(--duration-fast) var(--ease);
  }

  &[data-swipe="end"] {
    opacity: 0;
    transform: translateX(100%);
    transition:
      opacity var(--duration-fast) var(--ease),
      transform var(--duration-fast) var(--ease);
  }
}

.ds-toast-viewport__item > .ds-toast {
  box-shadow: var(--shadow-lg);
  width: 100%;
}
</style>
