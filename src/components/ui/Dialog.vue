<script setup vapor lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from "vue";
import { useTeleportTarget } from "ropav/teleport-provider";

import { isTopDialog, registerDialog, unregisterDialog } from "./dialogStack";
import { useFocusTrap } from "./useFocusTrap";

interface DialogProps {
  open: boolean;
  /** Accessible title announced when the dialog opens. */
  title: string;
  /** Optional description announced after the title. */
  description?: string;
  variant?: "modal" | "sheet";
  size?: "sm" | "lg";
  layer?: "default" | "system";
  portalTo?: string | HTMLElement;
  scope?: "viewport" | "container";
  modal?: boolean;
  /** Disable Escape and outside-pointer dismissal. */
  dismissible?: boolean;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<DialogProps>(), {
  description: undefined,
  variant: "modal",
  size: "sm",
  layer: "default",
  portalTo: undefined,
  scope: "viewport",
  modal: true,
  dismissible: true,
});

const emit = defineEmits<{
  "update:open": [next: boolean];
  close: [];
}>();

const attrs = useAttrs();
const dialogId = Symbol("ds-dialog");
const titleId = `ds-dialog-title-${useId()}`;
const descriptionId = `ds-dialog-description-${useId()}`;
const portalRoot = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const trapEnabled = computed(() => props.open && props.modal);
const resolvedPortalTo = useTeleportTarget(() => props.portalTo);

let restoreFocusTo: HTMLElement | null = null;
let wasOpen = false;

useFocusTrap(
  content,
  {
    allowOutsideClick: true,
    escapeDeactivates: false,
    preventScroll: true,
    tabbableOptions: { displayCheck: "none" },
  },
  trapEnabled,
);

function unregister(): void {
  unregisterDialog(dialogId);
  document.removeEventListener("keydown", onDocumentKeydown);
}

async function register(): Promise<void> {
  await nextTick();
  if (!props.open || portalRoot.value === null) return;

  registerDialog({ id: dialogId, modal: props.modal, root: portalRoot.value });
  document.removeEventListener("keydown", onDocumentKeydown);
  document.addEventListener("keydown", onDocumentKeydown);

  if (props.modal && content.value !== null && !content.value.contains(document.activeElement)) {
    content.value.focus({ preventScroll: true });
  }
}

async function restoreFocus(): Promise<void> {
  const target = restoreFocusTo;
  restoreFocusTo = null;
  await nextTick();
  if (target?.isConnected) target.focus({ preventScroll: true });
}

function requestClose(): void {
  if (!props.open) return;
  emit("update:open", false);
  emit("close");
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (
    event.key !== "Escape" ||
    event.defaultPrevented ||
    !props.dismissible ||
    !isTopDialog(dialogId)
  ) {
    return;
  }

  event.preventDefault();
  requestClose();
}

function onOverlayPointerDown(event: PointerEvent): void {
  if (event.target !== event.currentTarget || !props.dismissible || !isTopDialog(dialogId)) {
    return;
  }
  requestClose();
}

watch(
  () => [props.open, props.modal, resolvedPortalTo.value] as const,
  ([open]) => {
    unregister();
    if (!open) {
      if (wasOpen) void restoreFocus();
      wasOpen = false;
      return;
    }

    if (!wasOpen) {
      const activeElement = document.activeElement;
      restoreFocusTo =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
    }
    wasOpen = true;
    void register();
  },
  { flush: "post", immediate: true },
);

onBeforeUnmount(() => {
  unregister();
  if (wasOpen) void restoreFocus();
  // Own the teleported root lifecycle so dynamically removed app surfaces
  // cannot retain stale dialogs while their dismissal transition is pending.
  portalRoot.value?.remove();
});
</script>

<template>
  <span class="ds-dialog__host">
    <Teleport v-if="open" :to="resolvedPortalTo">
      <div ref="portalRoot" class="ds-dialog__portal" :data-dialog-modal="modal || undefined">
        <div
          class="ds-dialog__overlay"
          :class="[
            `ds-dialog__overlay--${variant}`,
            `ds-dialog__overlay--${scope}`,
            `ds-dialog__overlay--${layer}`,
          ]"
          aria-hidden="true"
          @pointerdown="onOverlayPointerDown"
        />
        <div
          v-bind="attrs"
          ref="content"
          class="ds-dialog__content"
          :class="[
            `ds-dialog__content--${variant}`,
            `ds-dialog__content--${scope}`,
            `ds-dialog__content--${size}`,
            `ds-dialog__content--${layer}`,
          ]"
          role="dialog"
          :aria-modal="modal ? 'true' : undefined"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
        >
          <h2 :id="titleId" class="ds-dialog__title">{{ title }}</h2>
          <p v-if="description" :id="descriptionId" class="ds-dialog__description">
            {{ description }}
          </p>
          <slot />
        </div>
      </div>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
.ds-dialog__host,
.ds-dialog__portal {
  display: contents;
}

.ds-dialog__overlay {
  background-color: color-mix(in oklab, var(--color-bg) 60%, transparent);
  inset: 0;
  animation: ds-dialog-overlay-in 160ms var(--ease) both;
}

.ds-dialog__overlay--default {
  z-index: var(--dialog-overlay-z);
}

.ds-dialog__overlay--system {
  z-index: var(--permission-dialog-overlay-z);
}

.ds-dialog__overlay--viewport {
  position: fixed;
}

.ds-dialog__overlay--container {
  position: absolute;
}

.ds-dialog__overlay--sheet {
  background-color: color-mix(in oklab, var(--color-bg) 35%, transparent);
}

.ds-dialog__content {
  background-color: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.ds-dialog__content--default {
  z-index: var(--dialog-content-z);
}

.ds-dialog__content--system {
  z-index: var(--permission-dialog-content-z);
}

.ds-dialog__content--viewport {
  position: fixed;
}

.ds-dialog__content--container {
  position: absolute;
}

.ds-dialog__content--modal {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  inset-block-start: 50%;
  inset-inline-start: 50%;
  padding: var(--space-lg);
  transform: translate(-50%, -50%) scale(1);
  animation: ds-dialog-modal-in 180ms var(--ease) both;
}

.ds-dialog__content--modal.ds-dialog__content--sm {
  inline-size: min(420px, calc(100vw - 32px));
}

.ds-dialog__content--modal.ds-dialog__content--lg {
  inline-size: min(720px, calc(100vw - 32px));
}

.ds-dialog__content--modal.ds-dialog__content--sm.ds-dialog__content--container {
  inline-size: min(420px, calc(100% - 32px));
}

.ds-dialog__content--modal.ds-dialog__content--lg.ds-dialog__content--container {
  inline-size: min(720px, calc(100% - 32px));
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
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--space-xs);
}

.ds-dialog__description {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
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
