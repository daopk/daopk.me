<script setup vapor lang="ts">
import { computed, useTemplateRef, type CSSProperties } from "vue";
import {
  useFloatingPosition,
  useHoverDisclosure,
  type FloatingReference,
  type FloatingSide,
} from "ropav/floating";
import { useTeleportTarget } from "ropav/teleport-provider";

import { useSlotTrigger } from "./useSlotTrigger";

type FloatingAlign = "start" | "center" | "end";

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

const triggerHost = useTemplateRef<HTMLElement>("triggerHost");
const content = useTemplateRef<HTMLElement>("content");
const arrow = useTemplateRef<HTMLElement>("arrow");
const trigger = useSlotTrigger(triggerHost, {});
const positionReference = computed<FloatingReference | null>(
  () => props.reference ?? trigger.value,
);
const resolvedPortalTo = useTeleportTarget(() => props.portalTo);

const { isOpen } = useHoverDisclosure({
  open: () => props.open,
  defaultOpen: props.defaultOpen,
  openDelay: () => props.openDelay,
  closeDelay: () => props.closeDelay,
  disabled: () => props.disabled,
  touchBehavior: () => (props.enableTouch ? "toggle" : "none"),
  interactionTarget: () => positionReference.value,
  contentTarget: content,
  onOpenChange: (next) => emit("update:open", next),
});

function placement() {
  return props.align === "center" ? props.side : (`${props.side}-${props.align}` as const);
}

const {
  actualPlacement,
  arrowStyle: ropavArrowStyle,
  floatingStyle,
} = useFloatingPosition({
  arrow,
  autoUpdateOptions: () => ({
    animationFrame: props.updatePositionStrategy === "always",
  }),
  collisionPadding: 8,
  floating: content,
  flipOptions: () => ({
    fallbackStrategy: props.prioritizePosition ? "initialPlacement" : "bestFit",
  }),
  offset: () => props.sideOffset,
  open: isOpen,
  placement,
  reference: () => positionReference.value,
  strategy: "fixed",
});

const resolvedSide = computed(() => actualPlacement.value.split("-")[0] as FloatingSide);
const oppositeSide: Record<FloatingSide, FloatingSide> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};
const arrowStyle = computed<CSSProperties>(() => ({
  ...ropavArrowStyle.value,
  [oppositeSide[resolvedSide.value]]: "-4px",
}));
</script>

<template>
  <span ref="triggerHost" class="ds-floating-trigger"><slot /></span>
  <Teleport v-if="isOpen" :to="resolvedPortalTo">
    <div
      ref="content"
      :class="['ds-hover-card', contentClass]"
      :data-side="resolvedSide"
      :style="floatingStyle"
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
