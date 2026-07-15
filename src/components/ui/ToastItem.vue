<script setup vapor lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { X } from "~/icons/lucide";

import { dismissToast, type ToastRecord } from "./useToast";

const props = defineProps<{ toast: ToastRecord }>();

const root = ref<HTMLElement | null>(null);
const swipeState = ref<"move" | "cancel" | "end" | undefined>(undefined);
const swipeOffset = ref("0px");
const assertive = computed(() => props.toast.tone === "error" || props.toast.tone === "warning");

let remaining = props.toast.duration;
let startedAt = 0;
let timer: number | undefined;
let swipeStartX: number | null = null;

function clearTimer(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
}

function dismiss(): void {
  clearTimer();
  dismissToast(props.toast.id);
}

function resumeTimer(): void {
  clearTimer();
  if (!Number.isFinite(remaining)) return;
  if (remaining <= 0) {
    dismiss();
    return;
  }
  startedAt = Date.now();
  timer = window.setTimeout(dismiss, remaining);
}

function pauseTimer(): void {
  if (timer === undefined) return;
  remaining = Math.max(0, remaining - (Date.now() - startedAt));
  clearTimer();
}

function resumeWhenIdle(): void {
  if (swipeStartX !== null || root.value?.contains(document.activeElement)) return;
  resumeTimer();
}

function onFocusOut(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget)) return;
  resumeWhenIdle();
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  swipeStartX = event.clientX;
  swipeState.value = "move";
  swipeOffset.value = "0px";
  pauseTimer();
  try {
    root.value?.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic events and older engines can expose the method without an
    // active pointer capture; swipe tracking still works from local events.
  }
}

function onPointerMove(event: PointerEvent): void {
  if (swipeStartX === null) return;
  const distance = Math.max(0, event.clientX - swipeStartX);
  swipeOffset.value = `${distance}px`;
}

function resetSwipe(event?: PointerEvent): void {
  if (event && root.value?.hasPointerCapture?.(event.pointerId)) {
    root.value.releasePointerCapture(event.pointerId);
  }
  swipeStartX = null;
  swipeState.value = "cancel";
  swipeOffset.value = "0px";
  resumeWhenIdle();
}

function onPointerUp(event: PointerEvent): void {
  if (swipeStartX === null) return;
  const distance = Math.max(0, event.clientX - swipeStartX);
  const threshold = Math.max(48, (root.value?.offsetWidth ?? 0) * 0.3);
  if (distance >= threshold) {
    swipeState.value = "end";
    swipeStartX = null;
    dismiss();
    return;
  }
  resetSwipe(event);
}

onMounted(resumeTimer);
onBeforeUnmount(clearTimer);
</script>

<template>
  <div
    ref="root"
    class="ds-toast"
    :class="`ds-toast--${toast.tone}`"
    :role="assertive ? 'alert' : 'status'"
    :aria-live="assertive ? 'assertive' : 'polite'"
    aria-atomic="true"
    :data-swipe="swipeState"
    :style="{ '--ds-toast-swipe-move-x': swipeOffset }"
    @focusin="pauseTimer"
    @focusout="onFocusOut"
    @pointercancel="resetSwipe"
    @pointerdown="onPointerDown"
    @pointerenter="pauseTimer"
    @pointerleave="resumeWhenIdle"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <div class="ds-toast__body">
      <div v-if="toast.title" class="ds-toast__title">{{ toast.title }}</div>
      <p v-if="toast.description" class="ds-toast__description">
        {{ toast.description }}
      </p>
    </div>
    <button
      class="ds-toast__close"
      type="button"
      aria-label="Dismiss notification"
      @click="dismiss"
    >
      <X class="ds-toast__close-icon" aria-hidden="true" />
    </button>
  </div>
</template>
