<script setup vapor lang="ts">
import DismissAllIcon from "~icons/lucide/trash-2";
import CloseIcon from "~icons/lucide/x";
import { computed, type VaporComponent } from "vue";

import { IconButton, Modal, type ModalFocusTrapOptions } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";

import type { NavigationFrame } from "../navigation";
import AppSwitcherCard from "./AppSwitcherCard.vue";

const props = defineProps<{
  frames: ReadonlyArray<NavigationFrame>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", frameId: string): void;
  (e: "dismiss", frameId: string): void;
  (e: "dismiss-all"): void;
}>();

const kernel = useKernel();

const APP_SWITCHER_CONTENT_BASE_Z_INDEX = 951;
const focusTrapOptions: ModalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" },
};
const modalClassNames = {
  root: "app-switcher",
  overlay: "app-switcher__overlay",
  panel: "app-switcher__panel",
  header: "app-switcher__header",
  body: "app-switcher__modal-body",
};

interface ResolvedFrame extends NavigationFrame {
  name: string;
  icon: VaporComponent;
}

const cards = computed<ResolvedFrame[]>(() => {
  const manifests = new Map(kernel.apps.list().map((m) => [m.id, m]));
  const resolved: ResolvedFrame[] = [];

  for (let i = props.frames.length - 1; i >= 0; i--) {
    const frame = props.frames[i];
    const manifest = manifests.get(frame.manifestId);
    if (!manifest) {
      // HMR. Skip rather than crash; the orphan handle will be reaped on
      continue;
    }
    resolved.push({
      ...frame,
      name: manifest.name,
      icon: manifest.icon,
    });
  }

  return resolved;
});

const canDismissAll = computed(() => props.frames.length > 0);

function onClose(): void {
  emit("close");
}

function onSelect(frameId: string): void {
  emit("select", frameId);
}

function onDismiss(frameId: string): void {
  emit("dismiss", frameId);
}

function onDismissAll(): void {
  if (canDismissAll.value) {
    emit("dismiss-all");
  }
}
</script>

<template>
  <Modal
    :open="true"
    aria-label="Recent apps"
    size="full"
    :base-z-index="APP_SWITCHER_CONTENT_BASE_Z_INDEX"
    :teleport="false"
    :show-close-button="false"
    initial-focus=".app-switcher__close"
    :focus-trap-options="focusTrapOptions"
    :overlay-props="{ color: 'var(--app-switcher-scrim)' }"
    :class-names="modalClassNames"
    @close="onClose"
  >
    <template #header>
      <IconButton
        class="app-switcher__close"
        ariaLabel="Close recent apps"
        variant="plain"
        @click="onClose"
      >
        <CloseIcon aria-hidden="true" />
      </IconButton>
      <h2 class="app-switcher__title">Recent apps</h2>
      <IconButton
        class="app-switcher__dismiss-all"
        ariaLabel="Close all recent apps"
        variant="plain"
        :disabled="!canDismissAll"
        @click="onDismissAll"
      >
        <DismissAllIcon aria-hidden="true" />
      </IconButton>
    </template>
    <div class="app-switcher__body">
      <p v-if="cards.length === 0" class="app-switcher__empty">No running apps</p>
      <ul v-else class="app-switcher__list">
        <li v-for="card in cards" :key="card.frameId" class="app-switcher__item">
          <AppSwitcherCard
            :frame-id="card.frameId"
            :handle-id="card.handleId"
            :manifest-id="card.manifestId"
            :name="card.name"
            :icon="card.icon"
            @select="onSelect"
            @dismiss="onDismiss"
          />
        </li>
      </ul>
    </div>
  </Modal>
</template>

<style lang="scss">
.app-switcher {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  inset: 0;
  position: absolute;
  z-index: var(--app-switcher-z);
}

.app-switcher__panel {
  background: var(--color-bg);
  block-size: 100%;
  display: flex;
  flex-direction: column;
  inline-size: 100%;
}

.app-switcher__modal-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
  padding: 0;
}

.app-switcher__header {
  align-items: center;
  block-size: calc(var(--app-switcher-header-h) + var(--mobile-shell-safe-area-top, 0px));
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-md);
  padding-block-start: var(--mobile-shell-safe-area-top, 0px);
  padding-inline-end: calc(
    var(--app-switcher-padding-inline) + var(--mobile-shell-safe-area-right, 0px)
  );
  padding-inline-start: calc(
    var(--app-switcher-padding-inline) + var(--mobile-shell-safe-area-left, 0px)
  );
}

.app-switcher__close,
.app-switcher__dismiss-all {
  align-items: center;
  background: transparent;
  block-size: 36px;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  inline-size: 36px;
  justify-content: center;
  transition: background var(--duration-fast) var(--ease);

  svg {
    block-size: 18px;
    inline-size: 18px;
  }

  &:hover:not(:disabled) {
    background: var(--color-bg-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  &:disabled {
    color: var(--color-fg-muted);
    cursor: default;
    opacity: 0.45;
  }
}

.app-switcher__title {
  color: var(--color-fg);
  flex: 1 1 auto;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-switcher__dismiss-all {
  color: var(--color-error-soft);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error) 8%, transparent);
    color: var(--color-error);
  }
}

.app-switcher__body {
  padding-block-end: calc(
    var(--app-switcher-padding-inline) + var(--mobile-shell-safe-area-bottom, 0px)
  );
  padding-block-start: var(--app-switcher-padding-inline);
  padding-inline-end: calc(
    var(--app-switcher-padding-inline) + var(--mobile-shell-safe-area-right, 0px)
  );
  padding-inline-start: calc(
    var(--app-switcher-padding-inline) + var(--mobile-shell-safe-area-left, 0px)
  );
}

.app-switcher__list {
  display: flex;
  flex-direction: column;
  gap: var(--app-switcher-card-gap);
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-switcher__empty {
  color: var(--color-fg-muted);
  font-size: 14px;
  margin: 0;
  padding-block: var(--space-xl);
  text-align: center;
}
</style>
