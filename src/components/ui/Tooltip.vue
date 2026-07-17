<script setup vapor lang="ts">
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import { useTeleportTarget } from "ropav/teleport-provider";

import { useFloatingPosition, type FloatingAlign, type FloatingSide } from "./useFloatingPosition";
import { toggleAriaToken, useSlotTrigger } from "./useSlotTrigger";

interface TooltipProps {
  label?: string;
  side?: FloatingSide;
  align?: FloatingAlign;
  delayDuration?: number;
  sideOffset?: number;
  disabled?: boolean;
  contentClass?: string;
  portalTo?: string | HTMLElement;
}

const props = withDefaults(defineProps<TooltipProps>(), {
  label: undefined,
  side: "top",
  align: "center",
  delayDuration: 300,
  sideOffset: 6,
  disabled: false,
  contentClass: "",
  portalTo: undefined,
});

const open = ref(false);
const hovered = ref(false);
const focused = ref(false);
const triggerHost = useTemplateRef<HTMLElement>("triggerHost");
const content = useTemplateRef<HTMLElement>("content");
const arrow = useTemplateRef<HTMLElement>("arrow");
const contentId = `ds-tooltip-${useId()}`;
let openTimer: ReturnType<typeof setTimeout> | undefined;

function clearOpenTimer(): void {
  if (openTimer !== undefined) clearTimeout(openTimer);
  openTimer = undefined;
}

function openWithDelay(): void {
  if (props.disabled || open.value) return;
  clearOpenTimer();
  openTimer = setTimeout(
    () => {
      if (!props.disabled && (hovered.value || focused.value)) open.value = true;
    },
    Math.max(0, props.delayDuration),
  );
}

function close(): void {
  clearOpenTimer();
  open.value = false;
}

function onPointerEnter(): void {
  hovered.value = true;
  openWithDelay();
}

function onPointerLeave(): void {
  hovered.value = false;
  if (!focused.value) close();
}

function onFocusIn(): void {
  focused.value = true;
  openWithDelay();
}

function onFocusOut(): void {
  focused.value = false;
  if (!hovered.value) close();
}

function onKeydown(event: Event): void {
  if (event instanceof KeyboardEvent && event.key === "Escape") close();
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
}

const trigger = useSlotTrigger(triggerHost, {
  focusin: onFocusIn,
  focusout: onFocusOut,
  keydown: onKeydown,
  pointerenter: onPointerEnter,
  pointerleave: onPointerLeave,
});
const resolvedPortalTo = useTeleportTarget(() => props.portalTo);
const { arrowStyle, floatingStyle, resolvedSide } = useFloatingPosition({
  align: () => props.align,
  arrow,
  floating: content,
  open: () => open.value,
  reference: () => trigger.value,
  side: () => props.side,
  sideOffset: () => props.sideOffset,
});

watch(
  [open, trigger],
  ([nextOpen, nextTrigger], [previousOpen, previousTrigger]) => {
    if (previousTrigger && (previousOpen || previousTrigger !== nextTrigger)) {
      toggleAriaToken(previousTrigger, "aria-describedby", contentId, false);
    }
    toggleAriaToken(nextTrigger, "aria-describedby", contentId, nextOpen);
  },
  { immediate: true },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  },
);
watch(open, (nextOpen) => {
  document.removeEventListener("keydown", onDocumentKeydown);
  if (nextOpen) document.addEventListener("keydown", onDocumentKeydown);
});
onBeforeUnmount(() => {
  clearOpenTimer();
  document.removeEventListener("keydown", onDocumentKeydown);
  toggleAriaToken(trigger.value, "aria-describedby", contentId, false);
});
</script>

<template>
  <span ref="triggerHost" class="ds-floating-trigger"><slot /></span>
  <Teleport v-if="open && !disabled" :to="resolvedPortalTo">
    <div
      :id="contentId"
      ref="content"
      role="tooltip"
      :class="['ds-tooltip', contentClass]"
      :data-side="resolvedSide"
      :style="floatingStyle"
      @keydown="onKeydown"
    >
      <slot name="content">{{ label }}</slot>
      <span
        ref="arrow"
        class="ds-tooltip__arrow"
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

.ds-tooltip {
  animation: ds-tooltip-in var(--duration-fast) var(--ease) both;
  background: var(--color-fg);
  border-radius: var(--radius-sm);
  color: var(--color-bg);
  font-size: var(--font-size-xs);
  line-height: var(--leading-snug);
  max-inline-size: 240px;
  padding: var(--space-2xs) var(--space-sm);
  z-index: var(--tooltip-z);
}

.ds-tooltip__arrow {
  background: var(--color-fg);
  block-size: 8px;
  inline-size: 8px;
  position: absolute;
  transform: rotate(45deg);
}

@keyframes ds-tooltip-in {
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
  .ds-tooltip {
    animation-duration: 0ms;
  }
}
</style>
