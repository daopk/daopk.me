<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";

interface DialogProps {
  open: boolean;
  /** Accessible title — required by reka-ui for `aria-labelledby`. */
  title: string;
  /** Optional description — wires `aria-describedby` when present. */
  description?: string;
  variant?: "modal" | "sheet";
  /**
   * When `false`, ESC + overlay-click do NOT close the dialog. Used
   * by the permission prompt to force an explicit user decision —
   * "Don't allow" is the explicit deny path, never a backdrop dismiss.
   */
  dismissible?: boolean;
}

const props = withDefaults(defineProps<DialogProps>(), {
  description: undefined,
  variant: "modal",
  dismissible: true,
});

const emit = defineEmits<{
  "update:open": [next: boolean];
  close: [];
}>();

function onUpdateOpen(value: boolean): void {
  emit("update:open", value);
  if (!value) emit("close");
}

function onInteractOutside(event: Event): void {
  if (!props.dismissible) event.preventDefault();
}

function onEscapeKeyDown(event: Event): void {
  if (!props.dismissible) event.preventDefault();
}
</script>

<template>
  <DialogRoot :open="open" @update:open="onUpdateOpen">
    <DialogPortal>
      <DialogOverlay class="ds-dialog__overlay" :class="`ds-dialog__overlay--${variant}`" />
      <DialogContent
        class="ds-dialog__content"
        :class="`ds-dialog__content--${variant}`"
        @interact-outside="onInteractOutside"
        @escape-key-down="onEscapeKeyDown"
      >
        <DialogTitle class="ds-dialog__title">{{ title }}</DialogTitle>
        <DialogDescription v-if="description" class="ds-dialog__description">{{
          description
        }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped lang="scss">
.ds-dialog__overlay {
  background-color: color-mix(in oklab, var(--color-bg) 60%, transparent);
  inset: 0;
  position: fixed;
  z-index: var(--dialog-overlay-z);
  animation: ds-dialog-overlay-in 160ms var(--ease) both;
}

.ds-dialog__overlay--sheet {
  background-color: color-mix(in oklab, var(--color-bg) 35%, transparent);
}

.ds-dialog__content {
  background-color: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  position: fixed;
  z-index: var(--dialog-content-z);
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.ds-dialog__content--modal {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  inline-size: min(420px, calc(100vw - 32px));
  inset-block-start: 50%;
  inset-inline-start: 50%;
  padding: var(--space-lg);
  transform: translate(-50%, -50%) scale(1);
  animation: ds-dialog-modal-in 180ms var(--ease) both;
}

.ds-dialog__content--sheet {
  border-block-start: 1px solid var(--color-border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  inline-size: 100%;
  inset-block-end: 0;
  inset-inline: 0;
  padding: var(--space-lg) var(--space-lg)
    calc(var(--space-lg) + max(0px, env(safe-area-inset-bottom, 0))) var(--space-lg);
  transform: translateY(0);
  animation: ds-dialog-sheet-in 220ms var(--ease) both;
}

.ds-dialog__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--space-xs);
}

.ds-dialog__description {
  color: var(--color-fg-muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 var(--space-md);
}

@keyframes ds-dialog-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes ds-dialog-modal-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes ds-dialog-sheet-in {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-dialog__overlay,
  .ds-dialog__content--modal,
  .ds-dialog__content--sheet {
    animation-duration: 0ms;
  }
}
</style>
