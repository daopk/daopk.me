<script setup lang="ts">
import {
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "reka-ui";

import { X } from "~/icons/lucide";

import { dismissToast, toastQueue, type ToastTone } from "./useToast";

// Errors/warnings interrupt (assertive); info/success announce politely.
function liveType(tone: ToastTone): "foreground" | "background" {
  return tone === "error" || tone === "warning" ? "foreground" : "background";
}

function onOpenChange(open: boolean, id: string): void {
  if (!open) {
    dismissToast(id);
  }
}
</script>

<template>
  <ToastProvider>
    <ToastRoot
      v-for="toast in toastQueue"
      :key="toast.id"
      class="ds-toast"
      :class="`ds-toast--${toast.tone}`"
      :duration="toast.duration"
      :type="liveType(toast.tone)"
      @update:open="(open: boolean) => onOpenChange(open, toast.id)"
    >
      <div class="ds-toast__body">
        <ToastTitle v-if="toast.title" class="ds-toast__title">{{ toast.title }}</ToastTitle>
        <ToastDescription v-if="toast.description" class="ds-toast__description">{{
          toast.description
        }}</ToastDescription>
      </div>
      <ToastClose class="ds-toast__close" aria-label="Dismiss notification">
        <X class="ds-toast__close-icon" aria-hidden="true" />
      </ToastClose>
    </ToastRoot>
    <ToastViewport class="ds-toast-viewport" />
  </ToastProvider>
</template>

<style lang="scss">
.ds-toast-viewport {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inset-block-end: 0;
  inset-inline-end: 0;
  list-style: none;
  margin: 0;
  max-inline-size: min(420px, calc(100vw - var(--space-lg) * 2));
  padding: var(--space-lg);
  padding-block-end: calc(var(--space-lg) + max(0px, env(safe-area-inset-bottom, 0)));
  position: fixed;
  width: 100%;
  z-index: var(--toast-z);
}

.ds-toast {
  align-items: flex-start;
  animation: ds-toast-in var(--duration-base) var(--ease) both;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-inline-start: 3px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);

  &[data-state="closed"] {
    animation: ds-toast-out var(--duration-fast) var(--ease) both;
  }

  &[data-swipe="move"] {
    transform: translateX(var(--reka-toast-swipe-move-x, 0));
  }

  &[data-swipe="end"] {
    animation: ds-toast-out var(--duration-fast) var(--ease) both;
  }
}

.ds-toast--info {
  border-inline-start-color: var(--color-accent);
}

.ds-toast--success {
  border-inline-start-color: var(--color-success);
}

.ds-toast--warning {
  border-inline-start-color: var(--color-accent-sheen);
}

.ds-toast--error {
  border-inline-start-color: var(--color-error-soft);
}

.ds-toast__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.ds-toast__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.ds-toast__description {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  line-height: var(--leading-snug);
  margin: 0;
}

.ds-toast__close {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  min-block-size: var(--control-height-sm);
  min-inline-size: var(--control-height-sm);

  &:hover {
    color: var(--color-fg);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.ds-toast__close-icon {
  block-size: 16px;
  inline-size: 16px;
}

@keyframes ds-toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ds-toast-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-toast,
  .ds-toast[data-state="closed"] {
    animation-duration: 0ms;
  }
}
</style>
