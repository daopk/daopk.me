<script setup lang="ts">
import {
  HoverCardArrow,
  HoverCardContent,
  HoverCardPortal,
  HoverCardRoot,
  HoverCardTrigger,
} from "reka-ui";

type FloatingReferenceElement =
  | Element
  | {
      contextElement?: Element;
      getBoundingClientRect: () => DOMRect;
    };

interface HoverCardProps {
  align?: "start" | "center" | "end";
  closeDelay?: number;
  contentClass?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  enableTouch?: boolean;
  open?: boolean;
  openDelay?: number;
  portalTo?: string | HTMLElement;
  prioritizePosition?: boolean;
  reference?: FloatingReferenceElement;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  updatePositionStrategy?: "optimized" | "always";
}

withDefaults(defineProps<HoverCardProps>(), {
  align: "center",
  closeDelay: 160,
  contentClass: "",
  defaultOpen: false,
  disabled: false,
  enableTouch: false,
  open: undefined,
  openDelay: 260,
  portalTo: "body",
  prioritizePosition: false,
  reference: undefined,
  side: "top",
  sideOffset: 10,
  updatePositionStrategy: "optimized",
});

const emit = defineEmits<{
  "update:open": [next: boolean];
}>();

function onUpdateOpen(value: boolean): void {
  emit("update:open", value);
}
</script>

<template>
  <slot v-if="disabled" />
  <HoverCardRoot
    v-else
    :open="open"
    :default-open="defaultOpen"
    :open-delay="openDelay"
    :close-delay="closeDelay"
    :enable-touch="enableTouch"
    @update:open="onUpdateOpen"
  >
    <HoverCardTrigger as-child>
      <slot />
    </HoverCardTrigger>
    <HoverCardPortal :to="portalTo">
      <HoverCardContent
        :class="['ds-hover-card', contentClass]"
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :collision-padding="8"
        :prioritize-position="prioritizePosition"
        :reference="reference"
        :update-position-strategy="updatePositionStrategy"
      >
        <slot name="content" />
        <HoverCardArrow class="ds-hover-card__arrow" :width="14" :height="7" />
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>

<style lang="scss">
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
  fill: var(--color-bg-elevated);
  stroke: var(--color-border);
  stroke-width: 1px;
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
