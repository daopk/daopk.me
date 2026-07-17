<script setup vapor lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

import { resolvePortalTarget } from "./portalTarget";
import {
  useFloatingPosition,
  type FloatingAlign,
  type FloatingReference,
  type FloatingSide,
} from "./useFloatingPosition";
import { useSlotTrigger } from "./useSlotTrigger";

interface HoverCardProps {
  align?: FloatingAlign;
  closeDelay?: number;
  contentClass?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  enableTouch?: boolean;
  open?: boolean;
  openDelay?: number;
  portalTo?: string | HTMLElement;
  prioritizePosition?: boolean;
  reference?: FloatingReference;
  side?: FloatingSide;
  sideOffset?: number;
  updatePositionStrategy?: "optimized" | "always";
}

const props = withDefaults(defineProps<HoverCardProps>(), {
  align: "center",
  closeDelay: 160,
  contentClass: "",
  defaultOpen: false,
  disabled: false,
  enableTouch: false,
  open: undefined,
  openDelay: 260,
  portalTo: undefined,
  prioritizePosition: false,
  reference: undefined,
  side: "top",
  sideOffset: 10,
  updatePositionStrategy: "optimized",
});

const emit = defineEmits<{
  "update:open": [next: boolean];
}>();

const internalOpen = ref(props.defaultOpen);
const isControlled = computed(() => props.open !== undefined);
const isOpen = computed(
  () => !props.disabled && (isControlled.value ? props.open === true : internalOpen.value),
);
const triggerHost = useTemplateRef<HTMLElement>("triggerHost");
const content = useTemplateRef<HTMLElement>("content");
const arrow = useTemplateRef<HTMLElement>("arrow");
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimers(): void {
  if (openTimer !== undefined) clearTimeout(openTimer);
  if (closeTimer !== undefined) clearTimeout(closeTimer);
  openTimer = undefined;
  closeTimer = undefined;
}

function setOpen(next: boolean): void {
  clearTimers();
  if (props.disabled && next) return;
  const changed = isOpen.value !== next;
  if (!isControlled.value) internalOpen.value = next;
  if (changed || isControlled.value) emit("update:open", next);
}

function scheduleOpen(): void {
  if (props.disabled || isOpen.value) return;
  if (closeTimer !== undefined) clearTimeout(closeTimer);
  openTimer = setTimeout(() => setOpen(true), Math.max(0, props.openDelay));
}

function scheduleClose(): void {
  if (openTimer !== undefined) clearTimeout(openTimer);
  closeTimer = setTimeout(() => setOpen(false), Math.max(0, props.closeDelay));
}

function onPointerEnter(): void {
  scheduleOpen();
}

function onPointerLeave(): void {
  scheduleClose();
}

function onFocusIn(): void {
  scheduleOpen();
}

function onFocusOut(event: Event): void {
  const related = event instanceof FocusEvent ? event.relatedTarget : null;
  if (related instanceof Node && content.value?.contains(related)) return;
  scheduleClose();
}

function onPointerUp(event: Event): void {
  if (!(event instanceof PointerEvent) || event.pointerType !== "touch" || !props.enableTouch)
    return;
  setOpen(!isOpen.value);
}

function onKeydown(event: Event): void {
  if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false);
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") setOpen(false);
}

const trigger = useSlotTrigger(triggerHost, {
  focusin: onFocusIn,
  focusout: onFocusOut,
  keydown: onKeydown,
  pointerenter: onPointerEnter,
  pointerleave: onPointerLeave,
  pointerup: onPointerUp,
});
const positionReference = computed<FloatingReference | null>(
  () => props.reference ?? trigger.value,
);
const resolvedPortalTo = computed(() => resolvePortalTarget(props.portalTo));
const { arrowStyle, floatingStyle, resolvedSide } = useFloatingPosition({
  align: () => props.align,
  arrow,
  floating: content,
  open: () => isOpen.value,
  prioritizePosition: () => props.prioritizePosition,
  reference: () => positionReference.value,
  side: () => props.side,
  sideOffset: () => props.sideOffset,
  updatePositionStrategy: () => props.updatePositionStrategy,
});

function cancelClose(): void {
  if (closeTimer !== undefined) clearTimeout(closeTimer);
  closeTimer = undefined;
}

function onContentFocusOut(event: FocusEvent): void {
  const related = event.relatedTarget;
  if (related instanceof Node && trigger.value?.contains(related)) return;
  scheduleClose();
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) setOpen(false);
  },
);
watch(isOpen, (nextOpen) => {
  document.removeEventListener("keydown", onDocumentKeydown);
  if (nextOpen) document.addEventListener("keydown", onDocumentKeydown);
});
onBeforeUnmount(() => {
  clearTimers();
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <span ref="triggerHost" class="ds-floating-trigger"><slot /></span>
  <Teleport v-if="isOpen" :to="resolvedPortalTo">
    <div
      ref="content"
      :class="['ds-hover-card', contentClass]"
      :data-side="resolvedSide"
      :style="floatingStyle"
      @focusin="cancelClose"
      @focusout="onContentFocusOut"
      @keydown="onKeydown"
      @pointerenter="cancelClose"
      @pointerleave="scheduleClose"
    >
      <slot name="content" />
      <span
        ref="arrow"
        class="ds-hover-card__arrow"
        :data-side="resolvedSide"
        :style="arrowStyle"
        aria-hidden="true"
      />
    </div>
  </Teleport>
</template>

<style lang="scss">
.ds-floating-trigger {
  display: contents;
}

.ds-hover-card {
  animation: ds-hover-card-in var(--duration-fast) var(--ease) both;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  outline: none;
  overflow: hidden;
  z-index: var(--tooltip-z);
}

.ds-hover-card:focus-visible {
  outline: none;
}

.ds-hover-card__arrow {
  background: var(--color-bg-elevated);
  block-size: 8px;
  border: 1px solid var(--color-border);
  inline-size: 8px;
  position: absolute;
  transform: rotate(45deg);
}

@keyframes ds-hover-card-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-hover-card {
    animation-duration: 0ms;
  }
}
</style>
