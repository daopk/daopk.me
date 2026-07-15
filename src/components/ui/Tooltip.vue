<script setup lang="ts">
import { computed } from "vue";
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";

import { resolvePortalTarget } from "./portalTarget";

interface TooltipProps {
  /** Tooltip text. Use the `content` slot for rich content instead. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Hover/focus open delay in ms. */
  delayDuration?: number;
  sideOffset?: number;
  /** Disables the tooltip while keeping the trigger interactive. */
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

const resolvedPortalTo = computed(() => resolvePortalTarget(props.portalTo));
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot :disabled="disabled">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal :to="resolvedPortalTo">
        <TooltipContent
          :class="['ds-tooltip', contentClass]"
          :side="side"
          :align="align"
          :side-offset="sideOffset"
          :collision-padding="8"
        >
          <slot name="content">{{ label }}</slot>
          <TooltipArrow class="ds-tooltip__arrow" :width="10" :height="5" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style lang="scss">
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
  fill: var(--color-fg);
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
