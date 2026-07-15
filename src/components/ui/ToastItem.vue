<script setup vapor lang="ts">
import { computed, ref, useTemplateRef } from "vue";

import { RopavToast } from "./ropavAdapter";
import { dismissToast, type ToastRecord } from "./useToast";

const props = defineProps<{ toast: ToastRecord }>();

const open = ref(true);
const root = useTemplateRef<HTMLElement>("root");
const color = computed(() => {
  switch (props.toast.tone) {
    case "success":
      return "green";
    case "warning":
      return "yellow";
    case "error":
      return "red";
    default:
      return "blue";
  }
});
const role = computed<"alert" | "status">(() =>
  props.toast.tone === "error" || props.toast.tone === "warning" ? "alert" : "status",
);

let swipeStartX: number | null = null;

function requestClose(): void {
  open.value = false;
}

function onOpenChange(next: boolean): void {
  open.value = next;
}

function removeToast(): void {
  dismissToast(props.toast.id);
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  swipeStartX = event.clientX;
  root.value?.setAttribute("data-swipe", "move");
  root.value?.style.setProperty("--ds-toast-swipe-move-x", "0px");
  try {
    root.value?.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events can expose capture without an active pointer.
  }
}

function onPointerMove(event: PointerEvent): void {
  if (swipeStartX === null) return;
  const distance = Math.max(0, event.clientX - swipeStartX);
  root.value?.style.setProperty("--ds-toast-swipe-move-x", `${distance}px`);
}

function resetSwipe(event?: PointerEvent): void {
  if (event && root.value?.hasPointerCapture?.(event.pointerId)) {
    root.value.releasePointerCapture(event.pointerId);
  }
  swipeStartX = null;
  root.value?.setAttribute("data-swipe", "cancel");
  root.value?.style.setProperty("--ds-toast-swipe-move-x", "0px");
}

function onPointerUp(event: PointerEvent): void {
  if (swipeStartX === null) return;
  const distance = Math.max(0, event.clientX - swipeStartX);
  const threshold = Math.max(48, (root.value?.offsetWidth ?? 0) * 0.3);
  if (distance >= threshold) {
    root.value?.setAttribute("data-swipe", "end");
    swipeStartX = null;
    requestClose();
    return;
  }
  resetSwipe(event);
}
</script>

<template>
  <li
    ref="root"
    class="ds-toast-viewport__item"
    @pointercancel="resetSwipe"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <RopavToast
      :open="open"
      :title="toast.title"
      :description="toast.description"
      :duration="toast.duration"
      :color="color"
      :role="role"
      radius="md"
      close-label="Dismiss notification"
      @update:open="onOpenChange"
      @after-leave="removeToast"
    />
  </li>
</template>
