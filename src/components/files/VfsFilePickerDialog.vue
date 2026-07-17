<script setup vapor lang="ts">
import { onBeforeUnmount, ref, toRef, useId } from "vue";

import { EmptyState, ScrollArea, Spinner } from "~/components/kit";
import { Alert, Button, Modal } from "~/components/ui";
import { basename } from "~/core/vfs/path";
import { useVfsFilePicker, type VfsFileAcceptPredicate } from "./useVfsFilePicker";

const DIALOG_CONTENT_BASE_Z_INDEX = 1601;
const modalId = `vfs-picker-${useId()}`;
const modalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" as const },
};
const modalOverlayProps = {
  color: "color-mix(in oklab, var(--color-bg) 60%, transparent)",
};

onBeforeUnmount(() => {
  const portalRoot = document.getElementById(modalId)?.parentElement;
  queueMicrotask(() => portalRoot?.remove());
});

const props = withDefaults(
  defineProps<{
    readonly open: boolean;
    readonly initialPath?: string;
    readonly title?: string;
    readonly confirmLabel?: string;
    readonly accept?: VfsFileAcceptPredicate;
  }>(),
  {
    initialPath: "/home",
    title: "Open File",
    confirmLabel: "Open",
    accept: undefined,
  },
);

const emit = defineEmits<{
  "update:open": [next: boolean];
  cancel: [];
  confirm: [path: string];
}>();

const entriesRef = ref<HTMLElement | null>(null);

const {
  cwd,
  entries,
  selectedPath,
  loading,
  error,
  selectedAccepted,
  breadcrumbs,
  liveMessage,
  loadDirectory,
  acceptsEntry,
  select,
  activateEntry,
  confirm,
  cancel,
  onDialogOpen,
  onBrowserKeydown,
  entryIcon,
  entryKind,
  entrySize,
  entryDate,
  activeDescendant,
} = useVfsFilePicker({
  isOpen: toRef(props, "open"),
  initialPath: toRef(props, "initialPath"),
  accept: toRef(props, "accept"),
  entriesRef,
  emit: {
    confirm: (path) => emit("confirm", path),
    cancel: () => emit("cancel"),
    close: () => emit("update:open", false),
  },
});
</script>

<template>
  <div class="vfs-picker__host">
    <Modal
      :id="modalId"
      :open="open"
      :title="title"
      size="lg"
      :base-z-index="DIALOG_CONTENT_BASE_Z_INDEX"
      :show-close-button="false"
      :focus-trap-options="modalFocusTrapOptions"
      :overlay-props="modalOverlayProps"
      :class-names="{ root: 'vfs-picker' }"
      @update:open="onDialogOpen"
    >
      <div class="vfs-picker__shell">
        <nav class="vfs-picker__breadcrumbs" aria-label="Current folder">
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
            <button
              type="button"
              class="vfs-picker__breadcrumb"
              :aria-current="crumb.path === cwd ? 'page' : undefined"
              :disabled="loading || crumb.path === cwd || undefined"
              @click="loadDirectory(crumb.path)"
            >
              {{ crumb.label }}
            </button>
            <span
              v-if="index < breadcrumbs.length - 1"
              class="vfs-picker__breadcrumb-separator"
              aria-hidden="true"
              >/</span
            >
          </template>
        </nav>

        <Alert
          class="vfs-picker__status"
          :color="error === null ? 'blue' : 'red'"
          variant="surface"
          :role="error === null ? 'status' : 'alert'"
        >
          {{ liveMessage }}
        </Alert>

        <div class="vfs-picker__browser">
          <div v-if="loading" class="vfs-picker__loading">
            <Spinner size="sm" />
            <span>Loading...</span>
          </div>
          <EmptyState v-else-if="entries.length === 0" class="vfs-picker__empty">
            This folder is empty.
          </EmptyState>
          <ScrollArea v-else class="vfs-picker__scroll">
            <div
              ref="entriesRef"
              class="vfs-picker__entries"
              role="listbox"
              tabindex="0"
              aria-label="Files"
              :aria-activedescendant="activeDescendant()"
              @keydown="onBrowserKeydown"
            >
              <div
                v-for="(entry, index) in entries"
                :id="`vfs-picker-entry-${index}`"
                :key="entry.path"
                class="vfs-picker__entry"
                :class="{
                  'vfs-picker__entry--selected': selectedPath === entry.path,
                  'vfs-picker__entry--disabled': entry.kind === 'file' && !acceptsEntry(entry),
                }"
                role="option"
                :aria-selected="selectedPath === entry.path"
                :aria-disabled="entry.kind === 'file' && !acceptsEntry(entry) ? 'true' : undefined"
                @click="select(entry)"
                @dblclick="activateEntry(entry)"
              >
                <component
                  :is="entryIcon(entry)"
                  class="vfs-picker__entry-icon"
                  :size="18"
                  aria-hidden="true"
                />
                <span class="vfs-picker__entry-name" :title="entry.name || basename(entry.path)">
                  {{ entry.name || basename(entry.path) }}
                </span>
                <span class="vfs-picker__entry-kind">{{ entryKind(entry) }}</span>
                <span class="vfs-picker__entry-size">{{ entrySize(entry) }}</span>
                <span class="vfs-picker__entry-date">{{ entryDate(entry) }}</span>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      <template #footer>
        <Button size="sm" @click="cancel">Cancel</Button>
        <Button
          size="sm"
          variant="solid"
          color="blue"
          :disabled="!selectedAccepted || loading"
          @click="confirm()"
        >
          {{ confirmLabel }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
.vfs-picker__host {
  display: contents;
}

.vfs-picker__shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: 100%;
  min-block-size: min(420px, calc(100vh - 180px));
  min-inline-size: 0;
}

.vfs-picker__breadcrumbs {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  min-block-size: var(--control-height-sm);
}

.vfs-picker__breadcrumb {
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  font: inherit;
  max-inline-size: 160px;
  min-block-size: var(--control-height-sm);
  overflow: hidden;
  padding: 0 var(--space-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-picker__breadcrumb:hover,
.vfs-picker__breadcrumb:focus-visible {
  background: var(--color-bg-subtle);
  color: var(--color-fg);
}

.vfs-picker__breadcrumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.vfs-picker__breadcrumb:disabled {
  color: var(--color-fg);
  cursor: default;
}

.vfs-picker__breadcrumb-separator {
  color: var(--color-fg-subtle);
}

.vfs-picker__status {
  flex: 0 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-picker__browser {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  flex: 1 1 auto;
  min-block-size: 240px;
  min-inline-size: 0;
  overflow: hidden;
}

.vfs-picker__loading,
.vfs-picker__empty {
  align-items: center;
  block-size: 100%;
  color: var(--color-fg-muted);
  display: flex;
  gap: var(--space-xs);
  justify-content: center;
  min-block-size: 240px;
  padding: var(--space-md);
}

.vfs-picker__scroll {
  block-size: 100%;
  min-block-size: 0;
}

.vfs-picker__entries {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-block-size: 100%;
  padding: var(--space-xs);
}

.vfs-picker__entries:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.vfs-picker__entry {
  align-items: center;
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  cursor: pointer;
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 22px minmax(0, 1fr) minmax(56px, 0.28fr) minmax(48px, 0.22fr) minmax(
      76px,
      0.32fr
    );
  min-block-size: 34px;
  padding: 0 var(--space-sm);
  user-select: none;
}

.vfs-picker__entry:hover,
.vfs-picker__entry--selected {
  background: var(--color-bg-subtle);
}

.vfs-picker__entry--selected {
  box-shadow: inset 0 0 0 1px var(--color-accent-soft);
}

.vfs-picker__entry--disabled {
  color: var(--color-fg-muted);
}

.vfs-picker__entry-icon {
  color: var(--color-fg-muted);
}

.vfs-picker__entry-name,
.vfs-picker__entry-kind,
.vfs-picker__entry-size,
.vfs-picker__entry-date {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-picker__entry-kind,
.vfs-picker__entry-size,
.vfs-picker__entry-date {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
}

@media (max-width: 560px) {
  .vfs-picker__shell {
    min-block-size: min(420px, calc(100vh - 144px));
  }

  .vfs-picker__entry {
    grid-template-columns: 22px minmax(0, 1fr) minmax(48px, auto);
  }

  .vfs-picker__entry-size,
  .vfs-picker__entry-date {
    display: none;
  }
}
</style>
